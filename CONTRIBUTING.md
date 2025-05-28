# Contributing to TaskMaster-Monday Sync

Thank you for considering contributing to TaskMaster-Monday Sync! This document provides guidelines and instructions for contributing.

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct. Please be respectful and considerate of others.

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in the [Issues](https://github.com/yourusername/task-master-sync/issues)
2. If not, open a new issue and include:
   - A clear title and description
   - Steps to reproduce the bug
   - Expected and actual behavior
   - Environment details (OS, Node.js version, etc.)
   - Screenshots if applicable

### Suggesting Features

1. Check if the feature has already been suggested in the [Issues](https://github.com/yourusername/task-master-sync/issues)
2. If not, open a new issue and include:
   - A clear title and description
   - Detailed explanation of the feature
   - Any relevant mockups or examples
   - How the feature would benefit users

### Pull Requests

1. Fork the repository
2. Create a new branch for your changes
3. Make your changes
4. Add or update tests as necessary
5. Update documentation if needed
6. Ensure all tests pass with `npm test`
7. Submit a pull request to the `development` branch

### Development Setup

```bash
# Clone your fork
git clone https://github.com/your-username/task-master-sync.git
cd task-master-sync

# Add the original repo as upstream
git remote add upstream https://github.com/yourusername/task-master-sync.git

# Install dependencies
npm install

# Run tests
npm test
```

## Coding Standards

- Follow the existing code style
- Use meaningful variable and function names
- Write clear comments for complex code
- Include JSDoc comments for public functions
- Write tests for new features or bug fixes

## Testing

- All new features should include tests
- Run `npm test` to run all tests
- Tests should be placed in the `test` directory

## Documentation

- Update documentation for new features or changes
- Document any new options or configuration
- Provide examples where appropriate

## Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Changes that do not affect the meaning of the code
- `refactor`: A code change that neither fixes a bug nor adds a feature
- `test`: Adding missing tests or correcting existing tests
- `chore`: Changes to the build process or auxiliary tools

Example: `feat: add support for custom column types`

## Release Process

1. Ensure all tests pass
2. Update version in package.json according to [Semantic Versioning](https://semver.org/)
3. Update CHANGELOG.md
4. Create a pull request to the main branch
5. After merging, create a new release on GitHub
6. CI will automatically publish the package to npm

## Questions?

If you have any questions about contributing, please open an issue or reach out to the maintainers.

Thank you for your contributions! 