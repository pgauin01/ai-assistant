# assistant-backend/test_threshold.py
import sys
# Import your initialized FAISS db from your main or brain builder file
from main import career_db 

def calibrate_threshold():
    # We test 4 categories of questions to find the perfect boundary.
    test_queries = {
        "1. EXACT MATCH": [
            "Tell me about a time you built a Zero-Knowledge Vault.", # Shadow OS
            "Tell me about reducing API timeouts."                    # HustleBot
        ],
        "2. SEMANTIC MATCH (Good)": [
            "How do you handle strict data privacy requirements?",
            "Tell me about a time you had to optimize backend latency."
        ],
        "3. TANGENTIAL MATCH (Risky)": [
            "What is your favorite programming language?",
            "How do you usually test your code?"
        ],
        "4. COMPLETE MISS (Should Trigger Pivot)": [
            "Tell me about a time you had a severe conflict with HR.",
            "Explain how you would bake a chocolate cake.",
            "Tell me about a time you fired an underperforming team member."
        ]
    }

    print(f"{'CATEGORY':<40} | {'SCORE':<10} | {'DOCUMENT EXTRACT'}")
    print("-" * 100)

    for category, questions in test_queries.items():
        print(f"\n--- {category} ---")
        for q in questions:
            # Run the search
            docs_and_scores = career_db.similarity_search_with_score(q, k=1)
            
            if docs_and_scores:
                doc, score = docs_and_scores[0]
                # Print the score rounded to 4 decimals, and the first 40 chars of the matched doc
                doc_preview = doc.page_content[:40].replace("\n", " ") + "..."
                print(f"{q[:38]+'..':<40} | {score:<10.4f} | {doc_preview}")
            else:
                print(f"{q:<40} | {'NO MATCH':<10} | N/A")

if __name__ == "__main__":
    calibrate_threshold()