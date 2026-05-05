import os
import sys

# Add the backend directory to Python path
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

print(f"Vercel Debug: BACKEND_DIR = {BACKEND_DIR}")
print(f"Vercel Debug: Current dir = {os.getcwd()}")
print(f"Vercel Debug: Python path = {sys.path}")

# Import the app at the top level for Vercel
from app.main import app
print("Vercel Debug: App imported successfully")

# Vercel Python runtime expects an ASGI app object named `app`.
