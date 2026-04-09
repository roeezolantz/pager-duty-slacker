# Contributing to PD-Slacker

Thank you for your interest in contributing to PD-Slacker! This document provides guidelines for contributing to the project.

## Code of Conduct

Be respectful, inclusive, and constructive. We're all here to build something useful together.

## How to Contribute

### Reporting Bugs

1. **Check existing issues** to avoid duplicates
2. **Use the bug report template** when creating a new issue
3. **Include details**:
   - Steps to reproduce
   - Expected behavior
   - Actual behavior
   - Environment (Node version, OS, etc.)
   - Logs/screenshots if applicable

### Suggesting Features

1. **Check existing feature requests** first
2. **Open a discussion** to gauge interest
3. **Describe the use case** clearly
4. **Explain why** it would benefit users

### Pull Requests

1. **Fork the repository**
2. **Create a feature branch** from `main`
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes**
4. **Add tests** for new functionality
5. **Update documentation** as needed
6. **Run the full test suite**
   ```bash
   npm test
   npm run lint
   npm run typecheck
   ```
7. **Commit with conventional commits**
   ```bash
   git commit -m "feat: add amazing feature"
   ```
8. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```
9. **Open a Pull Request**

## Development Setup

See [DEVELOPMENT.md](docs/DEVELOPMENT.md) for detailed setup instructions.

Quick start:
```bash
git clone https://github.com/roeezolantz/pd-slacker.git
cd pd-slacker
npm install
cp .env.example .env
# Edit .env with your credentials
npm run dev
```

## Coding Standards

### TypeScript

- Use TypeScript strict mode
- Avoid `any` type
- Prefer interfaces over types for object shapes
- Use proper type annotations

```typescript
// Good
function processUser(user: User): Promise<Result> {
  // ...
}

// Bad
function processUser(user: any): any {
  // ...
}
```

### Code Style

- Follow the ESLint configuration
- Use Prettier for formatting
- Run `npm run lint:fix` before committing
- Pre-commit hooks will enforce this

### Error Handling

- Use custom error classes
- Always handle promises
- Log errors with context
- Never swallow errors silently

```typescript
// Good
try {
  await riskyOperation();
} catch (error) {
  logger.error('Operation failed', error, { context: 'value' });
  throw new AppError('Operation failed', 500);
}

// Bad
try {
  await riskyOperation();
} catch (error) {
  // Silent failure
}
```

### Logging

- Use the provided logger
- Include context
- Use appropriate log levels
- Add correlation IDs for tracing

```typescript
import { createLogger } from '../utils/logger';

const logger = createLogger({ service: 'my-service' });

logger.info('Processing request', { userId: 'user-123' });
logger.error('Failed to process', error, { userId: 'user-123' });
```

### Testing

- Write tests for new features
- Maintain 80%+ coverage
- Use descriptive test names
- Follow AAA pattern (Arrange, Act, Assert)

```typescript
describe('MyService', () => {
  describe('myMethod', () => {
    it('should return expected result when given valid input', async () => {
      // Arrange
      const service = new MyService(mockConfig);
      const input = { value: 'test' };

      // Act
      const result = await service.myMethod(input);

      // Assert
      expect(result).toEqual(expectedOutput);
    });
  });
});
```

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>[optional scope]: <description>

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding/updating tests
- `chore`: Maintenance tasks

Examples:
```
feat: add support for multiple schedules
fix: handle timezone edge cases correctly
docs: update deployment guide
test: add integration tests for Slack service
```

## Pull Request Process

1. **Update documentation** if you change behavior
2. **Add tests** for new functionality
3. **Ensure CI passes** (tests, lint, typecheck)
4. **Keep PRs focused** - one feature/fix per PR
5. **Write a clear description** of what and why
6. **Link related issues** using keywords (Fixes #123)
7. **Be responsive** to review feedback

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
Describe how you tested the changes

## Checklist
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] Lint passes
- [ ] TypeScript compiles
- [ ] Tests pass
```

## Review Process

1. **Maintainers review** PRs
2. **CI must pass** before merge
3. **At least one approval** required
4. **Address feedback** or discuss alternatives
5. **Squash and merge** to keep history clean

## Areas for Contribution

Good first issues:
- Documentation improvements
- Test coverage improvements
- Bug fixes
- Performance optimizations

Larger features:
- Multiple schedule support
- Custom notification templates
- Dashboard/UI
- Multi-team support
- Additional integrations (Opsgenie, etc.)

## Questions?

- Open a discussion on GitHub
- Check existing issues and documentation
- Ask in PR comments

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

Thank you for contributing to PD-Slacker!
