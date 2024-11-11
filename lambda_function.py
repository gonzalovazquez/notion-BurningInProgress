import os
import json
import requests
from notion_client import Client

# Environment variables for API keys and database IDs
OMDB_API_KEY = os.getenv('OMDB_API_KEY')
NOTION_API_KEY = os.getenv('NOTION_API_KEY')
NOTION_DATABASE_ID = os.getenv('NOTION_DATABASE_ID')

# Initialize Notion client
notion = Client(auth=NOTION_API_KEY)

def fetch_movie_data(movie_title):
    """Fetch movie details from OMDb API by movie title."""
    url = f"http://www.omdbapi.com/?t={movie_title}&apikey={OMDB_API_KEY}"
    response = requests.get(url)
    if response.status_code == 200:
        data = response.json()
        if data["Response"] == "True":
            return {
                "Title": data.get("Title", "N/A"),
                "Director": data.get("Director", "N/A"),
                "Running Time": data.get("Runtime", "N/A"),
                "Genre": data.get("Genre", "N/A"),
                "Release Year": data.get("Year", "N/A"),
                "Plot": data.get("Plot", "N/A"),
                "IMDB Rating": data.get("imdbRating", "N/A")
            }
        else:
            return None
    else:
        return None

def add_to_notion(movie_data):
    """Add movie data to the Notion database."""
    notion.pages.create(
        parent={"database_id": NOTION_DATABASE_ID},
        properties={
            "Name": {"title": [{"text": {"content": movie_data["Title"]}}]},
            "Director": {"rich_text": [{"text": {"content": movie_data["Director"]}}]},
            "Running Time": {"rich_text": [{"text": {"content": movie_data["Running Time"]}}]},
            "Genre": {"rich_text": [{"text": {"content": movie_data["Genre"]}}]},
            "Release Year": {"rich_text": [{"text": {"content": movie_data["Release Year"]}}]},
            "Plot": {"rich_text": [{"text": {"content": movie_data["Plot"]}}]},
            "IMDB Rating": {"number": float(movie_data["IMDB Rating"]) if movie_data["IMDB Rating"] != "N/A" else None}
        }
    )

def lambda_handler(event, context):
    # Log the event for debugging
   # Log the event for debugging
    print("Received event: ", json.dumps(event))  # This helps you understand the structure of the event

    # Safely get the body from the event and parse it
    body = event.get('body')
    if body:
        body = json.loads(body)  # Parse the body string into a JSON object
    else:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "Event body is missing or malformed"})
        }

    # Safely extract the movie title
    movie_title = body.get("title")
    if not movie_title:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "Movie title is required"})
        }

    # Fetch and add movie data
    movie_data = fetch_movie_data(movie_title)
    if movie_data:
        add_to_notion(movie_data)
        return {
            "statusCode": 200,
            "body": json.dumps({"message": f"Added '{movie_title}' to Notion."})
        }
    else:
        return {
            "statusCode": 404,
            "body": json.dumps({"error": "Movie not found or API error."})
        }
