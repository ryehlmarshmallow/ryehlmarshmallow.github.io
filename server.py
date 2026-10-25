#!/usr/bin/env python3
"""
Lightweight Local HTTP Server with Phone QR Code
Run this to test on PC or access from phone on local Wi-Fi.
"""

import http.server
import socket
import socketserver
import sys

def get_local_ip() -> str:
    """Detect LAN IP address for phone connectivity."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # Does not actually make a connection, just gets the default interface IP
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

def print_banner(ip: str, port: int):
    url_local = f"http://localhost:{port}"
    url_phone = f"http://{ip}:{port}"
    
    print("=" * 60)
    print("   Hán Ngữ HSK - Local Development Server")
    print("=" * 60)
    print(f"👉 Trên máy tính (PC):  {url_local}")
    print(f"📱 Trên điện thoại:     {url_phone}")
    print("=" * 60)
    
    try:
        import qrcode
        print("\nQuét mã QR dưới đây bằng camera điện thoại (cùng mạng Wi-Fi):\n")
        qr = qrcode.QRCode(border=1)
        qr.add_data(url_phone)
        qr.print_ascii(invert=True)
        print()
    except ImportError:
        print("\n(Cài thêm qrcode để hiển thị mã QR: uv pip install qrcode)\n")

    print("Nhấn Ctrl+C để dừng máy chủ.")
    print("=" * 60 + "\n")

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Allow cross-origin if needed and disable aggressive caching during dev
        self.send_header('Cache-Control', 'no-cache, must-revalidate')
        super().end_headers()

def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    local_ip = get_local_ip()

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(('0.0.0.0', port), CustomHandler) as httpd:
        print_banner(local_ip, port)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nĐã dừng máy chủ.")

if __name__ == '__main__':
    main()
