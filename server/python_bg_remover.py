import sys
import os
from PIL import Image

def main():
    if len(sys.argv) != 3:
        print("Usage: python python_bg_remover.py <input_path> <output_path>")
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    if not os.path.exists(input_path):
        print(f"Error: Input file not found: {input_path}")
        sys.exit(1)

    try:
        # Import rembg lazily to avoid overhead if not removing background
        from rembg import remove, new_session
        
        print("[python_bg_remover] Loading U2-Net model...")
        session = new_session("u2net")
        
        print(f"[python_bg_remover] Opening image {input_path}...")
        img = Image.open(input_path).convert("RGBA")
        
        print("[python_bg_remover] Removing background...")
        # Alpha matting is automatically handled internally for a smoother edge if needed,
        # but rembg defaults are usually perfect.
        out_img = remove(img, session=session)
        
        print(f"[python_bg_remover] Saving result to {output_path}...")
        out_img.save(output_path, "PNG")
        
        print("[python_bg_remover] SUCCESS")
        sys.exit(0)
    except Exception as e:
        print(f"[python_bg_remover] Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
