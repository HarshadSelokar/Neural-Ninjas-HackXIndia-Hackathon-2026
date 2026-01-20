from playwright.sync_api import sync_playwright
from bs4 import BeautifulSoup
from urllib.parse import urlparse, urljoin


def get_site_id(url: str) -> str:
    netloc = urlparse(url).netloc.lower()
    if netloc.startswith("www."):
        netloc = netloc[4:]
    return netloc


def is_valid_link(link: str, base_domain: str) -> bool:
    parsed = urlparse(link)
    # Same domain (allow relative), no query strings, no fragments
    if parsed.query or parsed.fragment:
        return False
    same_domain = (parsed.netloc == "" or parsed.netloc.endswith(base_domain))
    if not same_domain:
        return False
    # Skip common non-HTML assets
    blocked_ext = (
        ".pdf", ".jpg", ".jpeg", ".png", ".gif", ".svg",
        ".mp4", ".webm", ".avi", ".zip", ".rar", ".7z", ".css", ".js"
    )
    path_lower = parsed.path.lower()
    if any(path_lower.endswith(ext) for ext in blocked_ext):
        return False

    # Skip auth/admin/utility pages which are often low-signal
    banned_substrings = (
        "login", "signin", "logout", "register", "signup",
        "account", "admin", "SecurePages".lower(), "session",
    )
    if any(bad in path_lower for bad in banned_substrings):
        return False

    return True


def normalize_url(url: str) -> str:
    # Remove trailing slash for consistency
    if url.endswith("/"):
        return url[:-1]
    return url


def crawl(url):
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(ignore_https_errors=True)
        page.goto(url)
        html = page.content()
        browser.close()
    return html


def crawl_site(start_url: str, max_depth: int = 3, max_pages: int = 40):
    base_domain = get_site_id(start_url)

    visited = set()
    queue = [(normalize_url(start_url), 0)]
    results = []  # list of (url, html)

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(ignore_https_errors=True)
        page.set_default_navigation_timeout(15000)

        # Block heavy/irrelevant resources to speed up loads
        def _block_route(route, request):
            resource_type = request.resource_type
            if resource_type in {"image", "media", "font", "stylesheet"}:
                return route.abort()
            return route.continue_()

        page.route("**/*", _block_route)

        while queue and len(results) < max_pages:
            current_url, depth = queue.pop(0)
            if current_url in visited:
                continue
            visited.add(current_url)

            try:
                page.goto(current_url, wait_until="domcontentloaded", timeout=15000)
                html = page.content()
            except Exception:
                continue

            results.append((current_url, html))

            if depth >= max_depth:
                continue

            # Extract and filter links
            try:
                links = page.eval_on_selector_all(
                    "a[href]",
                    "elements => elements.map(el => el.getAttribute('href'))"
                )
            except Exception:
                links = []

            for href in links:
                if not href:
                    continue
                absolute = urljoin(current_url + "/", href)
                if is_valid_link(absolute, base_domain):
                    absolute = normalize_url(absolute)
                    if absolute not in visited:
                        queue.append((absolute, depth + 1))

        browser.close()

    return results


def clean(html):
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "nav", "footer"]):
        tag.decompose()
    return soup.get_text(separator="\n")


if __name__ == "__main__":
    pages = crawl_site("https://pmjdy.gov.in/")
    print(len(pages))
    for u, _ in pages:
        print(u)