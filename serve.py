import http.server
import socketserver
import webbrowser
import os
import sys

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

    def log_message(self, format, *args):
        # Keep logs clean and avoid console encoding crashes
        pass

class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

def run_server():
    os.chdir(DIRECTORY)
    server_address = ('', PORT)
    
    try:
        httpd = ThreadedHTTPServer(server_address, QuietHandler)
    except OSError:
        # If 8000 is busy, fallback to 8080
        alt_port = 8080
        httpd = ThreadedHTTPServer(('', alt_port), QuietHandler)
        print(f"Port {PORT} occupe, utilisation du port {alt_port}")

    actual_port = httpd.server_port
    url = f"http://localhost:{actual_port}"
    print("=" * 60)
    print("Application Essence Autoroute demarree avec succes !")
    print(f"URL : {url}")
    print("=" * 60)
    
    # Try opening Google Chrome specifically
    try:
        chrome_path = None
        possible_paths = [
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe")
        ]
        for p in possible_paths:
            if os.path.exists(p):
                chrome_path = p
                break
        
        if chrome_path:
            webbrowser.register('chrome', None, webbrowser.BackgroundBrowser(chrome_path))
            webbrowser.get('chrome').open(url)
        else:
            webbrowser.open(url)
    except Exception as e:
        print("Note navigateur:", e)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServeur arrete.")
        httpd.shutdown()

if __name__ == '__main__':
    run_server()
