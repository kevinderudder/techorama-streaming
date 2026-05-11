#!/usr/bin/env python3
"""
serve-local.py — Local file server for conference signage
──────────────────────────────────────────────────────────
Serves all files in this folder over the venue WiFi so the TV screens
can load images, videos, and HTML slides by URL.

Usage:
  1. Put your files (PNG, JPG, MP4, HTML, …) in the same folder as this script.
  2. Open a terminal in this folder and run:
       python3 serve-local.py
  3. Copy the URL it prints, e.g.:
       http://192.168.1.42:8765/opening-slide.html
  4. Paste that URL into controller.html and push it to the screens.

Requirements: Python 3 (no extra packages needed).
"""

import http.server
import socketserver
import socket
import os
import sys

PORT = 8765

# ── Detect the machine's local (WiFi) IP address ──────────────────────────────

def get_local_ip():
    """Return the machine's LAN IP by opening a dummy UDP socket."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

# ── HTTP handler with CORS headers ────────────────────────────────────────────

class CORSHandler(http.server.SimpleHTTPRequestHandler):
    """SimpleHTTPRequestHandler with permissive CORS so the receiver iframe
    can load files from a different origin (github.io → local IP)."""

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    # Silence request logs — comment this out if you want verbose logging
    def log_message(self, fmt, *args):
        pass

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    local_ip = get_local_ip()
    base_url = f"http://{local_ip}:{PORT}"

    # Change to the script's own directory so relative file paths work
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    print()
    print("  ┌─────────────────────────────────────────────────────┐")
    print("  │         Conference Signage — Local File Server       │")
    print("  ├─────────────────────────────────────────────────────┤")
    print(f"  │  Base URL:  {base_url:<41}│")
    print("  │                                                     │")
    print("  │  Examples:                                          │")
    print(f"  │    {base_url}/opening-slide.html        │")
    print(f"  │    {base_url}/sponsor-logo.png          │")
    print(f"  │    {base_url}/promo-video.mp4           │")
    print("  │                                                     │")
    print("  │  Paste one of the above into controller.html        │")
    print("  │  and push it to all screens.                        │")
    print("  │                                                     │")
    print("  │  Press Ctrl+C to stop.                              │")
    print("  └─────────────────────────────────────────────────────┘")
    print()

    # List files available right now
    files = [f for f in os.listdir('.') if os.path.isfile(f) and not f.startswith('.') and f != os.path.basename(__file__)]
    if files:
        print("  Files available to serve:")
        for f in sorted(files):
            print(f"    {base_url}/{f}")
        print()

    try:
        with socketserver.TCPServer(("", PORT), CORSHandler) as httpd:
            httpd.serve_forever()
    except OSError as e:
        if "Address already in use" in str(e):
            print(f"  ✗ Port {PORT} is already in use. Stop the other process or change PORT in this script.")
        else:
            print(f"  ✗ Error: {e}")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n  Server stopped.")

if __name__ == "__main__":
    main()
