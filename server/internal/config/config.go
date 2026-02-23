package config

import (
	"os"
	"time"
)

type Config struct {
	Port             string
	DBPath           string
	JWTSecret        string
	Domain           string
	LicenseKey       string
	KeygenAccountID  string
	MediaURL         string
	AccessTokenTTL   time.Duration
	RefreshTokenTTL  time.Duration
}

func Load() *Config {
	return &Config{
		Port:            getEnv("SPECTRUS_PORT", "3000"),
		DBPath:          getEnv("SPECTRUS_DB_PATH", "./data/spectrus.db"),
		JWTSecret:       getEnv("SPECTRUS_JWT_SECRET", ""),
		Domain:          getEnv("SPECTRUS_DOMAIN", "localhost"),
		LicenseKey:      getEnv("SPECTRUS_LICENSE_KEY", ""),
		KeygenAccountID: getEnv("SPECTRUS_KEYGEN_ACCOUNT_ID", ""),
		MediaURL:        getEnv("SPECTRUS_MEDIA_URL", "http://localhost:3001"),
		AccessTokenTTL:  15 * time.Minute,
		RefreshTokenTTL: 7 * 24 * time.Hour,
	}
}

func getEnv(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok {
		return v
	}
	return fallback
}
