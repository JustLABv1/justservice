package executor

import (
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

	redacted, err := json.Marshal(redactSensitiveValueIn(decoded))
	if err != nil {
		return raw
	}

	return redacted
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