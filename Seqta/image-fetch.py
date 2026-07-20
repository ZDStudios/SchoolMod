import requests
import sys
import os

def main():
    if len(sys.argv) != 2:
        print("Usage: python fetch_photo.py <JSESSIONID>")
        sys.exit(1)

    jsessionid = sys.argv[1]

    cookies = {"JSESSIONID": jsessionid}
    headers = {
        "Content-Type": "application/json; charset=UTF-8",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest"
    }
    base_url = "https://students.trinity.wa.edu.au/seqta/student"

    # Step 1: POST to login endpoint to get user ID and UUID
    print("Fetching user info...")
    login_resp = requests.post(f"{base_url}/login", cookies=cookies, headers=headers, json={})

    if login_resp.status_code != 200:
        print(f"Login request failed with status {login_resp.status_code}")
        print("Response was:", login_resp.text[:500])
        sys.exit(1)


    try:
        login_data = login_resp.json()
        user_id = login_data["payload"]["id"]
        uuid = login_data["payload"]["personUUID"]
        user_name = login_data["payload"]["userDesc"]
        user_type = login_data["payload"]["type"]
        print(f"Got user ID: {user_id}, Name: {user_name}, Type: {user_type}, UUID: {uuid}")
    except (ValueError, KeyError) as e:
        print(f"Failed to parse user ID from response: {e}")
        sys.exit(1)

    # Step 2: Fetch the photo
    print("Fetching photo...")
    photo_url = f"{base_url}/photo/get?format=high&uuid={uuid}"
    photo_resp = requests.get(photo_url, cookies=cookies)

    if photo_resp.status_code != 200:
        print(f"Photo request failed with status {photo_resp.status_code}")
        sys.exit(1)

    # Determine file extension from content type
    content_type = photo_resp.headers.get("Content-Type", "")
    if "jpeg" in content_type or "jpg" in content_type:
        ext = ".jpg"
    elif "png" in content_type:
        ext = ".png"
    elif "gif" in content_type:
        ext = ".gif"
    elif "webp" in content_type:
        ext = ".webp"
    else:
        ext = ".jpg"  # default fallback

    # Save image next to the script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    filename = f"{user_id}-{user_name}-{user_type}{ext}"
    save_path = os.path.join(script_dir, filename)

    with open(save_path, "wb") as f:
        f.write(photo_resp.content)

    print(f"Image saved to: {save_path}")

if __name__ == "__main__":
    main()