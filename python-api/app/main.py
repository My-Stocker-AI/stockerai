import traceback
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.routes import session, routes, proxy, items, machines, upload

app = FastAPI(title="StockerAI API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
