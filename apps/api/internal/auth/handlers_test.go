package auth

import "testing"

func TestSanitizeRedirectPath(t *testing.T) {
	tests := map[string]string{
		"":                 "/",
		"/":                "/",
		"/tasks":           "/tasks",
		"//evil.example":   "/",
		"https://evil.com": "/",
		" tasks ":          "/",
		" /tasks ":         "/tasks",
	}

	for input, want := range tests {
		if got := sanitizeRedirectPath(input); got != want {
			t.Fatalf("sanitizeRedirectPath(%q) = %q, want %q", input, got, want)
		}
	}
}
