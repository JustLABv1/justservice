package config

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/spf13/viper"
)

type Config struct {
	Server   ServerConfig   `mapstructure:"server"`
	Database DatabaseConfig `mapstructure:"database"`
	JWT      JWTConfig      `mapstructure:"jwt"`
	GRPC     GRPCConfig     `mapstructure:"grpc"`
	Log      LogConfig      `mapstructure:"log"`
	OIDC     OIDCConfig     `mapstructure:"oidc"`
}

type ServerConfig struct {
	Host string `mapstructure:"host"`
	Port int    `mapstructure:"port"`
}

type DatabaseConfig struct {
	DSN             string        `mapstructure:"dsn"`
	MaxOpenConns    int           `mapstructure:"max_open_conns"`
	MaxIdleConns    int           `mapstructure:"max_idle_conns"`
	ConnMaxLifetime time.Duration `mapstructure:"conn_max_lifetime"`
	MigrationsPath  string        `mapstructure:"migrations_path"`
}

type JWTConfig struct {
	Secret          string        `mapstructure:"secret"`
	AccessTokenTTL  time.Duration `mapstructure:"access_token_ttl"`
	RefreshTokenTTL time.Duration `mapstructure:"refresh_token_ttl"`
}

type GRPCConfig struct {
	Host string `mapstructure:"host"`
	Port int    `mapstructure:"port"`
}

type LogConfig struct {
	Level  string `mapstructure:"level"`
	Format string `mapstructure:"format"`
}

type OIDCConfig struct {
	PublicBaseURL      string                        `mapstructure:"public_base_url"`
	BootstrapProviders []OIDCProviderBootstrapConfig `mapstructure:"bootstrap_providers"`
}

type OIDCProviderBootstrapConfig struct {
	Name         string   `mapstructure:"name" json:"name"`
	IssuerURL    string   `mapstructure:"issuer_url" json:"issuer_url"`
	ClientID     string   `mapstructure:"client_id" json:"client_id"`
	ClientSecret string   `mapstructure:"client_secret" json:"client_secret"`
	Scopes       []string `mapstructure:"scopes" json:"scopes"`
	Enabled      bool     `mapstructure:"enabled" json:"enabled"`
}

func Load(configPath string) (*Config, error) {
	v := viper.New()

	// Defaults
	v.SetDefault("server.host", "0.0.0.0")
	v.SetDefault("server.port", 8080)
	v.SetDefault("database.max_open_conns", 25)
	v.SetDefault("database.max_idle_conns", 10)
	v.SetDefault("database.conn_max_lifetime", "5m")
	v.SetDefault("database.migrations_path", "file://migrations")
	v.SetDefault("jwt.access_token_ttl", "15m")
	v.SetDefault("jwt.refresh_token_ttl", "7d")
	v.SetDefault("grpc.host", "0.0.0.0")
	v.SetDefault("grpc.port", 9090)
	v.SetDefault("log.level", "info")
	v.SetDefault("log.format", "json")
	v.SetDefault("oidc.public_base_url", "")
	v.SetDefault("oidc.bootstrap_providers_json", "")

	// Config file
	if configPath != "" {
		v.SetConfigFile(configPath)
		if err := v.ReadInConfig(); err != nil {
			return nil, fmt.Errorf("read config file %q: %w", configPath, err)
		}
	} else {
		v.SetConfigName("config")
		v.SetConfigType("yaml")
		v.AddConfigPath(".")
		v.AddConfigPath("./config")
		_ = v.ReadInConfig() // optional when no explicit path given
	}

	// Environment vars: JUSTSERVICE_SERVER_PORT etc.
	v.SetEnvPrefix("JUSTSERVICE")
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	v.AutomaticEnv()

	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return nil, fmt.Errorf("config unmarshal: %w", err)
	}

	if rawProviders := strings.TrimSpace(v.GetString("oidc.bootstrap_providers_json")); rawProviders != "" {
		var providers []OIDCProviderBootstrapConfig
		if err := json.Unmarshal([]byte(rawProviders), &providers); err != nil {
			return nil, fmt.Errorf("parse oidc bootstrap providers json: %w", err)
		}
		cfg.OIDC.BootstrapProviders = providers
	}

	return &cfg, nil
}

func (c *ServerConfig) Addr() string {
	return fmt.Sprintf("%s:%d", c.Host, c.Port)
}

func (c *GRPCConfig) Addr() string {
	return fmt.Sprintf("%s:%d", c.Host, c.Port)
}
