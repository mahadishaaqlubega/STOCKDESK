// Escape LIKE/ILIKE wildcards so a user-typed value matches literally.
// Without this, a shop name of "%" or an email of "%@%" matches any row.
function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, '\\$&');
}

module.exports = { escapeLike };
