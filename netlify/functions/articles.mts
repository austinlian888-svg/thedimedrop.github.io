import type { Context, Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

interface Article {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  category: string;
  categoryDisplay?: string;
  status: "draft" | "published";
  publishedAt: string;
  createdAt?: string;
  updatedAt?: string;
}

const STORE_NAME = "articles";

export default async (req: Request, context: Context) => {
  const store = getStore(STORE_NAME);
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);

  // Extract slug if present: /api/articles/[slug]
  const slug = pathParts.length > 2 ? pathParts.slice(2).join("/") : null;

  try {
    switch (req.method) {
      case "GET":
        if (slug) {
          // Get single article
          const article = await store.get(slug, { type: "json" });
          if (!article) {
            return new Response(JSON.stringify({ error: "Article not found" }), {
              status: 404,
              headers: { "Content-Type": "application/json" },
            });
          }
          return new Response(JSON.stringify(article), {
            headers: { "Content-Type": "application/json" },
          });
        } else {
          // List all articles
          const { blobs } = await store.list();
          const articles: Article[] = [];

          for (const blob of blobs) {
            const article = await store.get(blob.key, { type: "json" });
            if (article && article.status === "published") {
              articles.push(article);
            }
          }

          // Sort by publishedAt date (newest first)
          articles.sort((a, b) =>
            new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
          );

          return new Response(JSON.stringify(articles), {
            headers: { "Content-Type": "application/json" },
          });
        }

      case "POST":
        // Create or update article
        const body: Article = await req.json();

        if (!body.slug || !body.title) {
          return new Response(JSON.stringify({ error: "Slug and title are required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        // Sanitize slug
        const sanitizedSlug = body.slug
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "");

        const now = new Date().toISOString();
        const existingArticle = await store.get(sanitizedSlug, { type: "json" });

        const articleToSave: Article = {
          ...body,
          slug: sanitizedSlug,
          createdAt: existingArticle?.createdAt || now,
          updatedAt: now,
        };

        await store.setJSON(sanitizedSlug, articleToSave);

        return new Response(JSON.stringify(articleToSave), {
          status: existingArticle ? 200 : 201,
          headers: { "Content-Type": "application/json" },
        });

      case "DELETE":
        if (!slug) {
          return new Response(JSON.stringify({ error: "Slug is required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        await store.delete(slug);

        return new Response(JSON.stringify({ success: true }), {
          headers: { "Content-Type": "application/json" },
        });

      default:
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
          status: 405,
          headers: { "Content-Type": "application/json" },
        });
    }
  } catch (error) {
    console.error("Articles API error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const config: Config = {
  path: ["/api/articles", "/api/articles/*"],
};
