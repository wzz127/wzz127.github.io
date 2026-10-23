'use strict';
const { stripHTML } = require('hexo-util');

// Yilia expects an array of posts, rather than a { posts: [...] } response.
hexo.extend.generator.register('yilia-search-index', function (locals) {
  const posts = locals.posts.sort('-date').map(post => ({
    title: post.title,
    text: stripHTML(post.content),
    date: post.date.toISOString(),
    path: post.path,
    tags: post.tags.map(tag => ({
      name: tag.name,
      slug: tag.slug,
      permalink: tag.permalink
    }))
  }));

  return { path: 'content.json', data: JSON.stringify(posts) };
});
