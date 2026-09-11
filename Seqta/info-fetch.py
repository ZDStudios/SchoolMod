import requests
import sys
import os
import json

def main():
    if len(sys.argv) != 2:
        print("Usage: python fetch_info.py <JSESSIONID>")
        sys.exit(1)

    jsessionid = sys.argv[1]

    cookies = {"JSESSIONID": jsessionid}
    headers = {
        "Content-Type": "application/json; charset=UTF-8",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest"
    }
    base_url = "https://students.trinity.wa.edu.au/seqta/student"

    print("Fetching user info...")
    login_resp = requests.post(f"{base_url}/login", cookies=cookies, headers=headers, json={})

    if login_resp.status_code != 200:
        print(f"Login request failed with status {login_resp.status_code}")
        print("Response was:", login_resp.text[:500])
        sys.exit(1)

    try:
        login_data = login_resp.json()
        payload = login_data["payload"]
        user_id = payload["id"]
        user_name = payload["userDesc"]
        user_type = payload["type"]
        print(f"Got user ID: {user_id}, Name: {user_name}, Type: {user_type}")
    except (ValueError, KeyError) as e:
        print(f"Failed to parse response: {e}")
        print("Response was:", login_resp.text[:500])
        sys.exit(1)

    # Save full payload as JSON
    script_dir = os.path.dirname(os.path.abspath(__file__))
    filename = f"{user_id}-{user_name}-{user_type}.json"
    save_path = os.path.join(script_dir, filename)

    with open(save_path, "w", encoding="utf-8") as f:
        json.dump(login_data, f, indent=2)

    print(f"Info saved to: {save_path}")

if __name__ == "__main__":
    main()