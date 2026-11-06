"""Serve only the transmitter directory, without exposing recordings or the workspace."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

TRANSMITTER = Path(__file__).parent / 'part3'
RECEIVER = Path(__file__).parent / 'phone-receiver' / 'dist'


class AssignmentHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        resolved = Path(super().translate_path(path))
        # Serve the receiver from its canonical source, without a duplicate copy.
        try:
            relative = resolved.relative_to(TRANSMITTER / 'receiver')
        except ValueError:
            return str(resolved)
        return str(RECEIVER / relative)

if __name__ == "__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--port",type=int,default=8000)
    args=p.parse_args()
    handler=partial(AssignmentHandler,directory=str(TRANSMITTER))
    print(f"Open http://localhost:{args.port} in your computer browser. Ctrl+C stops the server.",flush=True)
    ThreadingHTTPServer(("127.0.0.1",args.port),handler).serve_forever()
