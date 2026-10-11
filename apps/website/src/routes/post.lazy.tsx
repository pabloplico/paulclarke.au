import { createLazyRoute } from '@tanstack/react-router';
import { PostDetail } from '@/components/sections/posts/PostDetail';

// Code-split: react-markdown is only needed when reading a post
export const Route = createLazyRoute('/writing/$slug')({
  component: PostPage,
});

function PostPage() {
  const { slug } = Route.useParams();
  return <PostDetail slug={slug} />;
}
