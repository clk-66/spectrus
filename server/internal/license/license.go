package license

import (
	"bytes"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"sync"
	"time"
)

const (
	keygenValidateURL = "https://api.keygen.sh/v1/accounts/%s/licenses/actions/validate-key"
	keygenMachinesURL = "https://api.keygen.sh/v1/accounts/%s/machines"
	gracePeriod       = 7 * 24 * time.Hour
	recheckInterval   = 24 * time.Hour
)

// Checker periodically validates the license key against Keygen.sh and exposes
// feature-gate helpers for premium endpoints.
type Checker struct {
	key         string
	accountID   string
	db          *sql.DB
	fingerprint string // stable machine fingerprint, computed once at construction

	mu      sync.RWMutex
	premium bool
}

// NewChecker creates a Checker. If licenseKey is empty the instance runs in
// Community mode and no network calls are ever made.
//
// dbPath is used together with os.Hostname() to derive a stable, unique
// machine fingerprint for Keygen.sh machine activation.
func NewChecker(licenseKey, accountID string, db *sql.DB, dbPath string) *Checker {
	return &Checker{
		key:         licenseKey,
		accountID:   accountID,
		db:          db,
		fingerprint: machineFingerprint(dbPath),
	}
}

// machineFingerprint returns a stable hex string that uniquely identifies this
// server instance. It is derived from os.Hostname() and a SHA-256 of dbPath so
// that neither value appears in plaintext in the Keygen.sh dashboard.
func machineFingerprint(dbPath string) string {
	hostname, _ := os.Hostname()
	dbHash := sha256.Sum256([]byte(dbPath))
	combined := sha256.Sum256([]byte(hostname + ":" + fmt.Sprintf("%x", dbHash)))
	return fmt.Sprintf("%x", combined)
}

// Start loads the cached license state from SQLite (so premium features are
// available immediately on restart) and launches the background validation loop.
func (c *Checker) Start() {
	if c.key == "" {
		slog.Info("no license key configured — running Community tier")
		return
	}
	c.loadFromDB()
	slog.Info("license key present, starting validation loop")
	go c.loop()
}

// IsPremium returns true when the active license grants premium features.
func (c *Checker) IsPremium() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.premium
}

// PremiumOnly is HTTP middleware that returns 402 Payment Required when the
// instance is not running on a premium license.
func (c *Checker) PremiumOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !c.IsPremium() {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusPaymentRequired)
			w.Write([]byte(`{"error":"premium license required"}`)) //nolint:errcheck
			return
		}
		next.ServeHTTP(w, r)
	})
}

// loop validates immediately on start then re-validates every 24 h.
func (c *Checker) loop() {
	c.validate()
	ticker := time.NewTicker(recheckInterval)
	defer ticker.Stop()
	for range ticker.C {
		c.validate()
	}
}

// validate is the core of the validation loop. It runs in three phases:
//
//  1. Call Keygen.sh to validate the license key.
//  2. If the key is valid, activate this machine's fingerprint against the license.
//     A 409 from the machines endpoint means already activated — treated as success.
//  3. Only after both steps succeed is premium set to true.
//
// Any network error in either phase falls through to the 7-day grace period.
// A definitively invalid key (revoked, expired) sets premium=false immediately.
func (c *Checker) validate() {
	licenseID, isValid, err := c.callKeygen()
	if err != nil {
		slog.Warn("license validation failed, checking grace period", "err", err)
		c.applyGracePeriod()
		return
	}

	if !isValid {
		// Keygen returned a definitive "not valid" response (expired, revoked, …).
		c.mu.Lock()
		c.premium = false
		c.mu.Unlock()
		c.saveToDB(false)
		slog.Info("license key is not valid")
		return
	}

	// Key is valid. Activate this machine's fingerprint so Keygen.sh records
	// the seat and the validate-key response can confirm premium status on
	// subsequent calls.
	if err := c.activateMachine(licenseID); err != nil {
		slog.Warn("machine activation failed, checking grace period", "err", err)
		c.applyGracePeriod()
		return
	}

	// Both steps succeeded.
	c.mu.Lock()
	c.premium = true
	c.mu.Unlock()
	c.saveToDB(true)
	slog.Info("license validated and machine activated", "premium", true)
}

// applyGracePeriod reads the last successful validation timestamp from the DB.
// If within gracePeriod it applies the cached premium state; otherwise it
// degrades to Community tier.
func (c *Checker) applyGracePeriod() {
	lastValidated, cachedPremium, err := c.readFromDB()
	if err != nil {
		slog.Warn("no cached license state — degrading to Community tier", "err", err)
		c.mu.Lock()
		c.premium = false
		c.mu.Unlock()
		return
	}

	if time.Since(lastValidated) <= gracePeriod {
		slog.Info("within grace period, using cached license state",
			"premium", cachedPremium,
			"last_validated", lastValidated.Format(time.RFC3339),
		)
		c.mu.Lock()
		c.premium = cachedPremium
		c.mu.Unlock()
	} else {
		slog.Warn("grace period expired — degrading to Community tier",
			"last_validated", lastValidated.Format(time.RFC3339),
		)
		c.mu.Lock()
		c.premium = false
		c.mu.Unlock()
	}
}

// callKeygen sends a validate-key request to Keygen.sh and returns the license
// ID (needed for machine activation), whether the key is currently valid, and
// any transport or protocol error.
func (c *Checker) callKeygen() (licenseID string, valid bool, err error) {
	type reqMeta struct {
		Key string `json:"key"`
	}
	type reqBody struct {
		Meta reqMeta `json:"meta"`
	}
	type respMeta struct {
		Valid bool   `json:"valid"`
		Code  string `json:"code"`
	}
	type respData struct {
		ID string `json:"id"`
	}
	type respBody struct {
		Meta respMeta `json:"meta"`
		Data respData `json:"data"`
	}

	payload, err := json.Marshal(reqBody{Meta: reqMeta{Key: c.key}})
	if err != nil {
		return "", false, fmt.Errorf("marshal validate request: %w", err)
	}

	url := fmt.Sprintf(keygenValidateURL, c.accountID)
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return "", false, fmt.Errorf("build validate request: %w", err)
	}
	req.Header.Set("Content-Type", "application/vnd.api+json")
	req.Header.Set("Accept", "application/vnd.api+json")

	httpClient := &http.Client{Timeout: 15 * time.Second}
	resp, err := httpClient.Do(req)
	if err != nil {
		return "", false, fmt.Errorf("keygen validate request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 500 {
		return "", false, fmt.Errorf("keygen server error: %d", resp.StatusCode)
	}

	var rb respBody
	if err := json.NewDecoder(resp.Body).Decode(&rb); err != nil {
		return "", false, fmt.Errorf("decode validate response: %w", err)
	}

	return rb.Data.ID, rb.Meta.Valid && rb.Meta.Code == "VALID", nil
}

// activateMachine registers this server's machine fingerprint against the
// license identified by licenseID. It uses the license key as a Bearer token
// (Keygen.sh "License" auth scheme), which is scoped to the license itself.
//
// HTTP 201 → newly activated.
// HTTP 409 → fingerprint already registered against this license → success.
// Any other non-2xx status → error, caller will apply grace period.
func (c *Checker) activateMachine(licenseID string) error {
	hostname, _ := os.Hostname()

	// Keygen.sh JSONAPI request body for POST /machines.
	type attrs struct {
		Fingerprint string `json:"fingerprint"`
		Name        string `json:"name"`
		Platform    string `json:"platform"`
	}
	type licenseRef struct {
		Type string `json:"type"`
		ID   string `json:"id"`
	}
	type licenseRel struct {
		Data licenseRef `json:"data"`
	}
	type rels struct {
		License licenseRel `json:"license"`
	}
	type machineData struct {
		Type          string `json:"type"`
		Attributes    attrs  `json:"attributes"`
		Relationships rels   `json:"relationships"`
	}
	type reqBody struct {
		Data machineData `json:"data"`
	}

	body := reqBody{
		Data: machineData{
			Type: "machines",
			Attributes: attrs{
				Fingerprint: c.fingerprint,
				Name:        hostname,
				Platform:    "server",
			},
			Relationships: rels{
				License: licenseRel{
					Data: licenseRef{Type: "licenses", ID: licenseID},
				},
			},
		},
	}

	payload, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("marshal machine request: %w", err)
	}

	url := fmt.Sprintf(keygenMachinesURL, c.accountID)
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("build machine request: %w", err)
	}
	req.Header.Set("Content-Type", "application/vnd.api+json")
	req.Header.Set("Accept", "application/vnd.api+json")
	// Keygen "License" auth scheme: scopes the token to the license itself,
	// giving it exactly the machine-management permissions needed here.
	req.Header.Set("Authorization", "License "+c.key)

	httpClient := &http.Client{Timeout: 15 * time.Second}
	resp, err := httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("machine activation request: %w", err)
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case http.StatusCreated:
		slog.Info("machine fingerprint activated", "fingerprint", c.fingerprint[:8]+"…")
		return nil
	case http.StatusConflict:
		// 409 = this fingerprint is already registered against the license.
		// Not an error — the machine was activated on a previous start.
		slog.Debug("machine fingerprint already activated")
		return nil
	default:
		return fmt.Errorf("machine activation returned HTTP %d", resp.StatusCode)
	}
}

// loadFromDB reads cached license state from the settings table and applies it
// if still within the grace period. Used during startup before the first API
// call completes.
func (c *Checker) loadFromDB() {
	lastValidated, cachedPremium, err := c.readFromDB()
	if err != nil {
		return // no cached state; leave premium=false until first validation
	}
	if time.Since(lastValidated) <= gracePeriod {
		c.mu.Lock()
		c.premium = cachedPremium
		c.mu.Unlock()
	}
}

// saveToDB persists the current validation result and timestamp into the
// settings table so they survive process restarts.
func (c *Checker) saveToDB(premium bool) {
	premiumVal := "0"
	if premium {
		premiumVal = "1"
	}

	upsert := `INSERT INTO settings (key, value) VALUES (?, ?)
	           ON CONFLICT(key) DO UPDATE SET value = excluded.value`

	if _, err := c.db.Exec(upsert, "license_last_validated", time.Now().UTC().Format(time.RFC3339)); err != nil {
		slog.Warn("save license_last_validated", "err", err)
	}
	if _, err := c.db.Exec(upsert, "license_is_premium", premiumVal); err != nil {
		slog.Warn("save license_is_premium", "err", err)
	}
}

// readFromDB returns the persisted last-validated timestamp and premium flag.
func (c *Checker) readFromDB() (time.Time, bool, error) {
	var tsStr string
	if err := c.db.QueryRow(`SELECT value FROM settings WHERE key = 'license_last_validated'`).Scan(&tsStr); err != nil {
		return time.Time{}, false, fmt.Errorf("read license_last_validated: %w", err)
	}

	ts, err := time.Parse(time.RFC3339, tsStr)
	if err != nil {
		return time.Time{}, false, fmt.Errorf("parse license_last_validated: %w", err)
	}

	var premiumStr string
	if err := c.db.QueryRow(`SELECT value FROM settings WHERE key = 'license_is_premium'`).Scan(&premiumStr); err != nil {
		return time.Time{}, false, fmt.Errorf("read license_is_premium: %w", err)
	}

	return ts, premiumStr == "1", nil
}
