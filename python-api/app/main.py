import traceback
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.routes import session, routes, proxy, items, machines, upload

app = FastAPI(title="StockerAI API", version="1.0.0")

# Explicit origin allowlist. A wildcard ("*") combined with
# allow_credentials=True is an INVALID CORS combination: the spec forbids it,
# and it made the server emit inconsistent permission headers (the preflight
# echoed the calling origin, the actual response sent "*"). Lenient desktop
# browsers ignored the mismatch; strict mobile browsers rejected it as
# "Failed to fetch". Listing the real app origins makes the headers valid and
# consistent for every request, on every device.
ALLOWED_ORIGINS = [
    "https://my-stocker-ai.com",
    "https://stocker-ai.pages.dev",
]
# Match Cloudflare Pages preview deploys (<hash>.stocker-ai.pages.dev) and the
# www host so no real app URL is ever blocked.
ALLOWED_ORIGIN_REGEX = (
    r"(https://([a-z0-9-]+\.)?stocker-ai\.pages\.dev)"
    r"|(https://www\.my-stocker-ai\.com)"
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


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch unhandled exceptions so CORS headers are still included."""
    tb = traceback.format_exc()
    print(f"[ERROR] {request.method} {request.url.path}: {exc}\n{tb}")
    return JSONResponse(
        status_code=500,
        content={"error": str(exc), "detail": tb.split("\n")[-3].strip()},
    )


@app.get("/health")
def health():
    return {"status": "ok", "service": "stockerai-api"}
