import os
from supabase import create_client

# Load Supabase configuration from environment variables with fallbacks
# It's recommended to set these env vars and rotate keys rather than rely on
# hard-coded values in source control.
SUPABASE_URL = os.environ.get(
	"SUPABASE_URL", "https://qthngxlmqudqzkkbpfae.supabase.co"
)
SUPABASE_KEY = os.environ.get(
	"SUPABASE_KEY",
	"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF0aG5neGxtcXVkcXpra2JwZmFlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjA0NzIxMywiZXhwIjoyMDgxNjIzMjEzfQ.oiPpiKTCdl68n8_KwX-1tHYHLFWFWJP6BxC3IUX6BOw",
)

if not SUPABASE_URL or not SUPABASE_KEY:
	raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be set in the environment")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
