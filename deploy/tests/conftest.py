import os
import tempfile

# A throwaway database before the backend is imported, as backend/tests/conftest.py does.
os.environ["GROUNDWORK_DB_PATH"] = os.path.join(tempfile.mkdtemp(), "test.db")
