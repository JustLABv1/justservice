package executor

import (
	"bytes"
	"encoding/json"
	"strings"
)

const redactedValue = "[REDACTED]"

func redactSensitiveJSON(raw json.RawMessage) json.RawMessage {
	if len(raw) == 0 {
		return raw
	}

	var decoded any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return raw
	}

	// First pass: collect actual secret values before replacing them with the placeholder.
	secrets := collectSecrets(decoded)

	// Second pass: replace by key name.
	redacted, err := json.Marshal(redactSensitiveValueIn(decoded))
	if err != nil {
		return raw
	}

	// Third pass: replace any remaining occurrences of secret values embedded
	// inside string content (e.g. in array of config lines or env export strings).
	for _, secret := range secrets {
		if len(secret) == 0 {
			continue
		}
		// The secret appears JSON-encoded (without surrounding quotes) inside the marshaled output.
		encoded, err := json.Marshal(secret)
		if err != nil {
			continue
		}
		// encoded is `"secret"` — strip the outer quotes to get just the inner JSON bytes.
		inner := encoded[1 : len(encoded)-1]
		redacted = bytes.ReplaceAll(redacted, inner, []byte(redactedValue))
	}

	return redacted
}

// collectSecrets walks the decoded JSON value and returns the string values of
// every field whose name matches isSensitiveFieldName.
func collectSecrets(value any) []string {
	var out []string
	switch typed := value.(type) {
	case map[string]any:
		for key, fieldValue := range typed {
			if isSensitiveFieldName(key) {
				if s, ok := fieldValue.(string); ok && s != "" {
					out = append(out, s)
				}
			} else {
				out = append(out, collectSecrets(fieldValue)...)
			}
		}
	case []any:
		for _, item := range typed {
			out = append(out, collectSecrets(item)...)
		}
	}
	return out
}

func redactSensitiveValueIn(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		redacted := make(map[string]any, len(typed))
		for key, fieldValue := range typed {
			if isSensitiveFieldName(key) {
				redacted[key] = redactedValue
				continue
			}
			redacted[key] = redactSensitiveValueIn(fieldValue)
		}
		return redacted
	case []any:
		redacted := make([]any, len(typed))
		for i, item := range typed {
			redacted[i] = redactSensitiveValueIn(item)
		}
		return redacted
	default:
		return value
	}
}

func isSensitiveFieldName(name string) bool {
	var normalized strings.Builder
	normalized.Grow(len(name))
	for _, char := range strings.ToLower(name) {
		if (char >= 'a' && char <= 'z') || (char >= '0' && char <= '9') {
			normalized.WriteRune(char)
		}
	}

	value := normalized.String()
	if value == "" {
		return false
	}

	if strings.Contains(value, "secret") {
		return true
	}

	return strings.HasSuffix(value, "password") ||
		strings.HasSuffix(value, "token") ||
		strings.HasSuffix(value, "apikey") ||
		strings.HasSuffix(value, "privatekey") ||
		value == "authorization"
}
