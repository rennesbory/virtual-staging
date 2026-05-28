import os
import requests
from duckduckgo_search import DDGS
import time

def download_images(query, num_images, folder_name):
    os.makedirs(folder_name, exist_ok=True)
    print(f"\n[*] Searching images for: {query}")
    
    with DDGS() as ddgs:
        results = ddgs.images(query, max_results=num_images)
        count = 0
        for res in results:
            image_url = res.get('image')
            if not image_url: 
                continue
            try:
                # Add headers to avoid 403 Forbidden on some luxury sites
                headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
                response = requests.get(image_url, headers=headers, timeout=5)
                if response.status_code == 200:
                    file_path = os.path.join(folder_name, f"{query.replace(' ', '_').replace(',', '')}_{count+1}.jpg")
                    with open(file_path, 'wb') as handler:
                        handler.write(response.content)
                    print(f"  [+] Downloaded: {file_path}")
                    count += 1
            except Exception as e:
                pass
                
            if count >= num_images:
                break
            time.sleep(0.5) # Prevent rate limiting

if __name__ == "__main__":
    print("🚀 Starting Automated Luxury Aesthetics Image Gatherer...")
    
    # 1. Living Room (거실)
    download_images("Restoration Hardware luxury living room interior editorial", 10, "dataset/living_room")
    download_images("Apparatus Studio lighting luxury living room Architectural Digest", 10, "dataset/living_room")
    download_images("Kinfolk magazine minimal wabi sabi living room", 10, "dataset/living_room")
    download_images("Assouline style chic luxury living room interior", 10, "dataset/living_room")
    
    # 2. Bedroom (침실)
    download_images("Restoration Hardware minimal luxury bedroom", 10, "dataset/bedroom")
    download_images("Architectural Digest neutral tone luxury bedroom", 10, "dataset/bedroom")
    download_images("Kinfolk aesthetic slow living bedroom", 10, "dataset/bedroom")
    
    # 3. Kitchen/Dining (부엌/다이닝)
    download_images("Restoration Hardware modern luxury kitchen island staging", 10, "dataset/kitchen")
    download_images("Apparatus Studio pendant light over dining table Architectural Digest", 10, "dataset/kitchen")
    
    print("\n✅ Dataset gathering complete! Check the 'dataset' folder in your workspace.")
