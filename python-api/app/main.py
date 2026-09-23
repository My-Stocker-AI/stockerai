import traceback
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from contextlib import asynccontextmanager

from app.config import require_runtime_settings
from app.routes import session, routes, proxy, items, machines, upload, diag, status


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Refuse to SERVE without the settings the server cannot work without. This check used to
    # run the instant this file was imported, which meant the automated test run — which only
    # imports the app to inspect it — died before a single test could start. Every push then
    # reported a failed test run for a reason that had nothing to do with any test.
    #
    # Moved to startup: reading the code needs no configuration, running it still does. A
    # genuinely misconfigured deploy fails immediately and says exactly what is missing.
    require_runtime_settings()
    yield


app = FastAPI(title="StockerAI API", version="1.0.0", lifespan=lifespan)

# Explicit origin allowlist. A wildcard ("*") combined with
# allow_credentials=True is an INVALID CORS combination: the spec forbids it,
# and it made the server emit inconsistent permission headers (the preflight
# echoed the calling origin, the actual response sent "*"). Lenient desktop
# browsers ignored the mismatch; strict mobile browsers rejected it as
# "Failed to fetch". Listing the real app origins makes the headers valid and
# consistent for every request, on every device.
ALLOWED_ORIGINS = [
    "https://my-stocker-ai.com",
    "https://www.my-stocker-ai.com",
    # ADDED 2026-08-06 — the site is served on FIVE addresses (all pointing at the same
    # Cloudflare project), and only some of them were listed here. Davy hit it live: he opened
    # stocker-ai.com, the app loaded normally, the upload began, and then the server refused the
    # connection — which reads to a driver as "can't reach the server" with no way to tell that
    # the address he used is the whole problem. The app being reachable at an address the API
    # will not talk to is a broken product, not a configuration nicety.
    "https://stocker-ai.com",
    "https://www.stocker-ai.com",
    "https://stockerai.pages.dev",       # the real Cloudflare Pages domain (NO hyphen)
    "https://stocker-ai.pages.dev",      # legacy hyphenated spelling, kept harmless
]
# Match Cloudflare Pages preview deploys (<hash>.stockerai.pages.dev) with OR without
# the hyphen, plus the www hosts, so no real app URL is ever blocked. The earlier
# hyphenated-only pattern silently blocked the real stockerai.pages.dev origin.
ALLOWED_ORIGIN_REGEX = (
    r"(https://([a-z0-9-]+\.)?stocker-?ai\.pages\.dev)"
    r"|(https://www\.my-stocker-ai\.com)"
    r"|(https://www\.stocker-ai\.com)"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=ALLOWED_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(session.router, prefix="/api")
app.include_router(routes.router, prefix="/api")
app.include_router(proxy.router, prefix="/api")
app.include_router(items.router, prefix="/api")
app.include_router(machines.router, prefix="/api")
app.include_router(upload.router, prefix="/api")
app.include_router(diag.router, prefix="/api")
app.include_router(status.router, prefix="/api")


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch unhandled exceptions so CORS headers are still included."""
    tb = traceback.format_exc()
    print(f"[ERROR] {request.method} {request.url.path}: {exc}\n{tb}")
    # Log the full detail server-side, but never return it to the client — raw
    # exception text leaks DB schema (table/column/constraint names) and stack
    # traces, which enable reconnaissance. Clients get a generic message.
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error. Please try again."},
    )


@app.get("/health")
def health():
    return {"status": "ok", "service": "stockerai-api"}
