"""
═══════════════════════════════════════════════════════════════
  CONECTADOS EXPRESS — Background Removal Server (Local)
  Runs on http://localhost:5050
  Uses rembg (U2-Net AI) to remove backgrounds locally & free
═══════════════════════════════════════════════════════════════
"""

import io
import base64
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
from rembg import remove
from PIL import Image

app = Flask(__name__)
CORS(app)  # Allow admin panel to call this server


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "bg-remover"})


@app.route("/remove-bg", methods=["POST"])
def remove_bg():
    """
    Accepts JSON: { "url": "https://i.ibb.co/..." }
    Returns JSON: { "success": true, "image_data": "data:image/png;base64,..." }
    """
    try:
        data = request.get_json()
        image_url = data.get("url", "")

        if not image_url:
            return jsonify({"success": False, "error": "No URL provided"}), 400

        # ── Step 1: Download the image ──
        print(f"📥 Downloading image: {image_url[:80]}...")
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
        resp = requests.get(image_url, headers=headers, timeout=30)
        resp.raise_for_status()

        # ── Step 2: Remove background with rembg (U2-Net AI) ──
        print("🤖 Removing background with AI...")
        input_image = Image.open(io.BytesIO(resp.content)).convert("RGBA")
        output_image = remove(input_image)

        # ── Step 3: Paste on white background ──
        print("🎨 Applying white background...")
        white_bg = Image.new("RGBA", output_image.size, (255, 255, 255, 255))
        white_bg.paste(output_image, mask=output_image.split()[3])  # Use alpha as mask
        final = white_bg.convert("RGB")

        # ── Step 4: Convert to base64 data URL ──
        buffer = io.BytesIO()
        final.save(buffer, format="PNG", optimize=True)
        b64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
        data_url = f"data:image/png;base64,{b64}"

        print(f"✅ Done! Output size: {len(b64) // 1024} KB")
        return jsonify({"success": True, "image_data": data_url})

    except requests.exceptions.RequestException as e:
        print(f"❌ Download error: {e}")
        return jsonify({"success": False, "error": f"Could not download image: {str(e)}"}), 400
    except Exception as e:
        print(f"❌ Processing error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


if __name__ == "__main__":
    print("=" * 60)
    print("  ✨ Background Removal Server")
    print("  📡 Running on http://localhost:5050")
    print("  🤖 Using rembg (U2-Net) for AI background removal")
    print("  💰 100% Free — runs locally on your PC")
    print("=" * 60)
    print()
    print("  The first image may take 30-60s (downloading AI model).")
    print("  Subsequent images process in 5-15 seconds.")
    print()
    app.run(host="0.0.0.0", port=5050, debug=False)
