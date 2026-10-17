"""Care Call server. Run from the repo root: python3 -m uvicorn server.main:app"""
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .routes import adapt, device, health, misc, patients, requests

app = FastAPI(title="Care Call server")

# The web app (Vercel) and /beacon call us from other origins. No cookies, so * is fine.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.exception_handler(StarletteHTTPException)
async def http_error(request: Request, exc: StarletteHTTPException):
    return JSONResponse({"error": str(exc.detail)}, status_code=exc.status_code)


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    first = exc.errors()[0] if exc.errors() else {}
    where = ".".join(str(p) for p in first.get("loc", []))
    return JSONResponse({"error": f"{where}: {first.get('msg', 'invalid request')}"}, status_code=422)


@app.exception_handler(Exception)
async def server_error(request: Request, exc: Exception):
    return JSONResponse({"error": "internal server error"}, status_code=500)


for module in (health, patients, requests, device, misc, adapt):
    app.include_router(module.router)
