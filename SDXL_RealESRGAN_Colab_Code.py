# Google Colab Setup Script for SDXL 1.0 & Real-ESRGAN
# নিচের পুরো কোডটি কপি করে আপনার Google Colab এর একটি নতুন Notebook-এ পেস্ট করুন এবং Run করুন।

import os
import subprocess
import threading
import time
import socket
import urllib.request

# 1. Install ComfyUI
!git clone https://github.com/comfyanonymous/ComfyUI.git
%cd ComfyUI
!pip install -q torch torchvision torchaudio --extra-index-url https://download.pytorch.org/whl/cu121
!pip install -q -r requirements.txt
!pip install -q cloudflare

# 2. Download SDXL 1.0 Base Model
print("Downloading SDXL 1.0 Base Model...")
!wget -O models/checkpoints/sd_xl_base_1.0.safetensors https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors

# 3. Download Real-ESRGAN x4 Plus (Upscaler)
print("Downloading Real-ESRGAN x4 Plus Model...")
!wget -O models/upscale_models/RealESRGAN_x4plus.pth https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth

# 4. Download VAE (Optional but recommended for SDXL)
print("Downloading SDXL VAE...")
!wget -O models/vae/sdxl_vae.safetensors https://huggingface.co/madebyollin/sdxl-vae-fp16-fix/resolve/main/sdxl_vae.safetensors

# 5. Define Cloudflare Tunnel Function
def iframe_thread(port):
    while True:
        time.sleep(0.5)
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        result = sock.connect_ex(('127.0.0.1', port))
        if result == 0:
            break
        sock.close()
    print("\nComfyUI is running. Starting Cloudflare tunnel...")

    # Start cloudflared
    p = subprocess.Popen(["cloudflared", "tunnel", "--url", f"http://127.0.0.1:{port}"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    for line in p.stderr:
        l = line.decode()
        if "trycloudflare.com" in l:
            url = l[l.find("http"):l.find(".com")+4]
            print("\n=======================================================")
            print(f"✅ YOUR SERVER URL: {url}")
            print("=======================================================\n")
            break

# 6. Install Cloudflared
!wget -q -c -nc https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O /usr/local/bin/cloudflared
!chmod +x /usr/local/bin/cloudflared

# 7. Start ComfyUI and Tunnel
threading.Thread(target=iframe_thread, daemon=True, args=(8188,)).start()

!python main.py --dont-print-signature
