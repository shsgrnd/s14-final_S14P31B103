import os
from openai import OpenAI
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, "../../../.env"))

API_KEY = os.getenv("GMS_KEY")
GMS_BASE_URL = os.getenv("GMS_BASE_URL", "https://gms.ssafy.io/gmsapi/")

def resolve_gms_url(base_url):
    base_url = base_url if base_url.endswith("/") else base_url + "/"
    if "api.openai.com" not in base_url:
        return f"{base_url}api.openai.com/v1"
    return base_url

client = OpenAI(api_key=API_KEY, base_url=resolve_gms_url(GMS_BASE_URL))

print(f"[TEST] Calling GMS API: {resolve_gms_url(GMS_BASE_URL)}")
try:
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": "say hello"}],
        timeout=10
    )
    print(f"[SUCCESS] Response: {response.choices[0].message.content}")
except Exception as e:
    print(f"[FAILED] Error: {e}")
