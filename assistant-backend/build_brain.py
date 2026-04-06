import os
import glob
from langchain_text_splitters import MarkdownHeaderTextSplitter
from langchain_ollama import OllamaEmbeddings
from langchain_community.vectorstores import FAISS

# Automatically get the absolute path to the assistant-backend folder
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def build_index():
    # 1. Look for career_data one folder level up from assistant-backend
    search_path = os.path.join(BASE_DIR, "..", "career_data", "*.md")
    files = glob.glob(search_path)
    
    if not files:
        print(f"❌ No markdown files found at: {search_path}")
        return

    print(f"📂 Found {len(files)} markdown files. Reading data...")

    # 2. Split the text based on your Markdown headers
    headers_to_split_on = [
    ("#", "Project"), 
    ("##", "Section"), 
    ("###", "Challenge") # <--- Add this!
]
    markdown_splitter = MarkdownHeaderTextSplitter(headers_to_split_on=headers_to_split_on)
    
    all_splits = []
    for file in files:
        with open(file, "r", encoding="utf-8") as f:
            text = f.read()
            splits = markdown_splitter.split_text(text)
            all_splits.extend(splits)
            
    # 3. Embed locally and save strictly inside assistant-backend
    print(f"🧠 Embedding {len(all_splits)} chunks using local nomic-embed-text...")
    embeddings = OllamaEmbeddings(model="nomic-embed-text")
    vectorstore = FAISS.from_documents(all_splits, embeddings)
    
    save_path = os.path.join(BASE_DIR, "career_vector_db")
    vectorstore.save_local(save_path)
    print(f"✅ Career Brain successfully built and saved to: {save_path}")

if __name__ == "__main__":
    build_index()