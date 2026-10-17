"""What the hosted server answers for the built frontend (deploy/spa.py)."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from deploy.spa import SpaStaticFiles


@pytest.fixture
def client(tmp_path):
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<!doctype html><div id=root></div>")
    (tmp_path / "assets" / "index-abc123.js").write_text("export {}")
    app = FastAPI()
    app.mount("/", SpaStaticFiles(directory=tmp_path), name="frontend")
    return TestClient(app)


def test_client_side_routes_get_the_app(client):
    response = client.get("/sites/DEMO-TRAY")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert response.headers["cache-control"] == "no-cache"


def test_built_files_are_cached_for_a_year(client):
    response = client.get("/assets/index-abc123.js")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "public, max-age=31536000, immutable"


def test_a_file_from_an_older_deploy_is_a_404_not_the_app(client):
    response = client.get("/assets/ReplayScreen-vnd6WPr0.js")
    assert response.status_code == 404
    assert "text/html" not in response.headers.get("content-type", "")


@pytest.mark.parametrize("path", ["/api/v1/nope", "/uploads/nope.jpg"])
def test_backend_paths_never_get_the_app(client, path):
    assert client.get(path).status_code == 404
