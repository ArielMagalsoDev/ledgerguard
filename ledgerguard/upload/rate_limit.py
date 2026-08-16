"""Best-effort client identifier for the upload rate limiter — never trust
this for
anything beyond rate limiting; it's spoofable by a direct non-proxied
client, an accepted limitation for a demo-scale limiter backed by the real
daily spend cap underneath it."""

from fastapi import Request


def client_key_from_headers(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        ip = forwarded_for.split(",")[0].strip()
        if ip:
            return ip
    if request.client:
        return request.client.host
    return "unknown"
