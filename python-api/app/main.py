from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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


@app.get("/health")
def health():
    return {"status": "ok", "service": "stockerai-api"}
