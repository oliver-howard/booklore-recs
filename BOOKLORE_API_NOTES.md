# BookLore API Integration Notes

## Important: API Endpoint Customization Required

The BookLore API client in this project uses **assumed endpoint patterns** based on common REST API conventions. Since the actual BookLore API documentation at https://ebooks.fiosa.us/api/v1/swagger-ui/index.html was not fully accessible during development, you may need to adjust the endpoints to match the actual API.

## Endpoints Currently Implemented

The following endpoints are assumed in [src/booklore-client.ts](src/booklore-client.ts):

### Authentication
```
POST /auth/login
Body: { username, password }
Response: { token } or { access_token }
```

### User Profile
```
GET /user/profile
Headers: Authorization: Bearer {token}
Response: UserProfile object
```

### Reading History
```
GET /user/readings?limit={limit}&status=read
Headers: Authorization: Bearer {token}
Response: Array of UserReading objects
```

### Books
```
GET /books?genre={genre}&limit={limit}
GET /books?author={author}&limit={limit}
GET /books/search?q={query}&limit={limit}
Headers: Authorization: Bearer {token}
Response: Array of Book objects
```

## How to Customize for Your API

1. **Check the Swagger Documentation**: Visit https://ebooks.fiosa.us/api/v1/swagger-ui/index.html and review the actual endpoints

2. **Update Authentication**: Edit [src/booklore-client.ts:20-42](src/booklore-client.ts#L20-L42)
   - Change the authentication endpoint if different
   - Update the response token field name
   - Adjust authentication method if needed (e.g., Basic Auth, OAuth)

3. **Update User Endpoints**: Edit the methods in [src/booklore-client.ts](src/booklore-client.ts)
   - `getUserProfile()` - Line 62
   - `getUserReadingHistory()` - Line 81

4. **Update Book Endpoints**: Edit the search methods
   - `getBooksByGenre()` - Line 103
   - `getBooksByAuthor()` - Line 125
   - `searchBooks()` - Line 147

## Expected Data Structures

The types are defined in [src/types.ts](src/types.ts). You may need to adjust these based on actual API responses:

### Book
```typescript
{
  id: number;
  title: string;
  author?: string;
  description?: string;
  genres?: string[];
  isbn?: string;
  publishedDate?: string;
  coverImageUrl?: string;
}
```

### UserReading
```typescript
{
  bookId: number;
  book: Book;
  rating?: number; // 1-5
  status?: 'want_to_read' | 'reading' | 'read';
  startedAt?: string;
  finishedAt?: string;
  review?: string;
  notes?: string;
}
```

### UserProfile
```typescript
{
  id: number;
  username: string;
  email?: string;
  favoriteGenres?: string[];
  favoriteAuthors?: string[];
}
```

## Testing Your API Integration

1. **Test Authentication First**:
```bash
# Add console.log to booklore-client.ts authenticate() method
npm run dev stats
```

2. **Test Data Retrieval**:
```bash
# This will attempt to fetch reading history
npm run dev stats
```

3. **Check Error Messages**: The error messages will indicate which endpoint failed and why

## Alternative: Using Mock Data

If you want to test the AI recommendations before setting up the API:

1. Create a file `src/mock-data.ts` with sample reading data
2. Temporarily modify `recommendation-service.ts` to use mock data instead of API calls
3. Test the AI recommendations with sample data
4. Once satisfied, integrate with the real API

## Common API Variations

### Authentication Variations
- **Basic Auth**: `Authorization: Basic {base64(username:password)}`
- **OAuth 2.0**: Requires additional token exchange flow
- **API Key**: `X-API-Key: {key}` header
- **Session-based**: Uses cookies instead of tokens

### Response Variations
- Some APIs wrap responses: `{ data: [...], meta: {...} }`
- Pagination might use different parameters: `page`, `offset`, `cursor`
- Field names might differ: `book_id` vs `bookId`, `author_name` vs `author`

## Recommended Testing Approach

1. Use a tool like Postman or curl to test the BookLore API manually
2. Document the actual request/response patterns
3. Update the TypeScript types and client methods accordingly
4. Test each method individually before running the full recommendation system

## Need Help?

If you encounter issues:
1. Check the Swagger documentation for exact endpoint patterns
2. Look at network requests in the BookLore web interface (browser DevTools)
3. Contact BookLore support for API documentation
4. Open an issue in this project's GitHub repository with API details

## Example: Updating an Endpoint

If the reading history endpoint is actually `/api/user/{userId}/books/read`:

```typescript
// In src/booklore-client.ts
async getUserReadingHistory(limit = 100): Promise<UserReading[]> {
  try {
    // Get user ID first (you may need to add this to the class)
    const profile = await this.getUserProfile();

    const response = await fetch(
      `${this.baseUrl}/user/${profile.id}/books/read?limit=${limit}`,
      {
        headers: this.getHeaders(),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch reading history: ${response.statusText}`);
    }

    // If API wraps response in { data: [] }
    const result = await response.json() as { data: UserReading[] };
    return result.data;
  } catch (error) {
    throw new Error(`Failed to fetch reading history: ${error}`);
  }
}
```

This flexibility is built into the architecture - just update the client methods to match your actual API!
