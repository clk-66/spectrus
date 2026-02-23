package media

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// Client is an HTTP client for the mediasoup microservice internal API.
// All methods treat the response body as an opaque JSON payload — the exact
// mediasoup wire format is owned by /media and not parsed here.
type Client struct {
	baseURL string
	http    *http.Client
}

func NewClient(baseURL string) *Client {
	return &Client{
		baseURL: baseURL,
		http:    &http.Client{Timeout: 10 * time.Second},
	}
}

// Join notifies mediasoup that userID is joining the voice room for channelID.
// Returns the raw JSON response (RTP capabilities etc.) to be forwarded to the client.
func (c *Client) Join(ctx context.Context, channelID, userID string) (json.RawMessage, error) {
	body, _ := json.Marshal(map[string]string{"user_id": userID})
	return c.do(ctx, http.MethodPost, "/rooms/"+channelID+"/join", body)
}

// Signal forwards a signaling payload (offer/answer/ICE candidate) to mediasoup
// and returns whatever mediasoup responds with (may be nil for one-way signals).
func (c *Client) Signal(ctx context.Context, channelID, userID string, payload json.RawMessage) (json.RawMessage, error) {
	body, err := json.Marshal(map[string]any{
		"user_id": userID,
		"signal":  payload,
	})
	if err != nil {
		return nil, err
	}
	return c.do(ctx, http.MethodPost, "/rooms/"+channelID+"/signal", body)
}

// Leave notifies mediasoup that userID has left the voice room for channelID.
func (c *Client) Leave(ctx context.Context, channelID, userID string) error {
	body, _ := json.Marshal(map[string]string{"user_id": userID})
	_, err := c.do(ctx, http.MethodDelete, "/rooms/"+channelID+"/leave", body)
	return err
}

// do executes a JSON request against the media service and returns the raw
// response body. A nil body (e.g. 204 No Content) is returned as nil, nil.
func (c *Client) do(ctx context.Context, method, path string, body []byte) (json.RawMessage, error) {
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("media %s %s: %w", method, path, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("media %s %s: status %d", method, path, resp.StatusCode)
	}

	// Decode into RawMessage; ignore errors for bodyless responses (204 etc.).
	var raw json.RawMessage
	_ = json.NewDecoder(resp.Body).Decode(&raw)
	return raw, nil
}
