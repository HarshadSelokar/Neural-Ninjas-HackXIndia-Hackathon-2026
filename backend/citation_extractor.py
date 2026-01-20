import re
from typing import List

def extract_citations(text: str) -> List[str]:
    """
    Extract all URLs from AI-generated text
    """
    pattern = r'https?://[^\s\)\]]+'
    citations = re.findall(pattern, text)
    return list(set(citations))
