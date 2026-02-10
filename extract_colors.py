from PIL import Image
from collections import Counter
import binascii

def get_palette(image_path):
    img = Image.open(image_path).convert('RGBA') # Force conversion to RGBA
    img = img.resize((150, 150))
    pixels = list(img.getdata())
    
    # Filter out transparent pixels
    pixels = [p[:3] for p in pixels if p[3] > 0]
    
    # Count most common colors
    counter = Counter(pixels)
    most_common = counter.most_common(10)
    
    hex_colors = []
    for (r, g, b), count in most_common:
        hex_code = '#{:02x}{:02x}{:02x}'.format(r, g, b)
        hex_colors.append(hex_code)
        
    return hex_colors

try:
    colors = get_palette('e:/Nathan/Projects/AegisMedix/code/assets/imgs/final_logo.png')
    print("Extracted Colors:", colors)
except Exception as e:
    print(f"Error: {e}")
