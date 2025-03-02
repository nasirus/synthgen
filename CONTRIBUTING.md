# Contributing to SynthGen

Thank you for your interest in contributing to SynthGen! This document outlines the process for contributing to the project.

## Code of Conduct

By participating in this project, you agree to abide by our code of conduct. Please be respectful and constructive in all interactions.

## How to Contribute

### Fork the Repository

1. Visit the [SynthGen repository](https://github.com/nasirus/synthgen) on GitHub
2. Click the "Fork" button in the upper right corner
3. Wait for GitHub to create a copy of the repository in your account

### Clone Your Fork

```bash
git clone https://github.com/YOUR-USERNAME/synthgen.git
cd synthgen
```

### Add the Upstream Repository

```bash
git remote add upstream https://github.com/nasirus/synthgen.git
```

### Create a Development Environment

1. Install prerequisites:
   - Docker and Docker Compose
   - Python 3.8+
   - Rust (for consumer development)

2. Set up the development environment:
   ```bash
   # Set up environment variables
   cp .env.example .env
   # Edit .env with your configuration

   # Install Python dependencies
   pip install -r requirements.txt

   # For Rust development
   cd consumer
   cargo build
   ```

### Create a Branch

Create a new branch for your feature or bugfix:

```bash
git checkout -b feature/your-feature-name
```

Or for bugfixes:

```bash
git checkout -b fix/issue-description
```

### Make Your Changes

1. Make your changes to the codebase
2. Follow the code style guidelines (see below)
3. Add or update tests as necessary
4. Update documentation if needed

### Commit Your Changes

```bash
git add .
git commit -m "Brief description of your changes"
```

Write clear, concise commit messages that explain what the changes do and why they were made.

### Push to Your Fork

```bash
git push origin feature/your-feature-name
```

### Create a Pull Request

1. Go to your fork on GitHub
2. Click the "New Pull Request" button
3. Select your branch and provide a clear description of your changes
4. Submit the pull request

## Pull Request Guidelines

1. **Title**: Use a clear, descriptive title
2. **Description**: Explain what your PR does, why it's needed, and how it works
3. **Reference Issues**: Link to any related issues with "Fixes #123" or "Relates to #123"
4. **Keep It Focused**: Each PR should address a single concern
5. **Tests**: Include relevant tests for your changes
6. **Documentation**: Update documentation as needed

## Code Style Guidelines

### Python

- Follow [PEP 8](https://www.python.org/dev/peps/pep-0008/) style guide
- Use type hints where appropriate
- Document functions and classes using docstrings
- Run `black` and `isort` on your code before committing

### Rust

- Follow [Rust API Guidelines](https://rust-lang.github.io/api-guidelines/)
- Format code with `rustfmt`
- Run `clippy` to check for common mistakes
- Write documentation comments for public APIs

## Development Workflow

### Keeping Your Fork Updated

```bash
git fetch upstream
git checkout main
git merge upstream/main
git push origin main
```

## Reporting Issues

If you find a bug or have a feature request:

1. Check if the issue already exists in the project's issue tracker
2. If not, create a new issue, providing as much detail as possible
3. For bugs, include steps to reproduce, expected behavior, and actual behavior
4. For features, explain the use case and benefits

## Release Process

1. The project maintainers will review and merge accepted PRs
2. Releases are created by maintainers following semantic versioning
3. Each release is documented with release notes

## Getting Help

If you need help with contributing:

- Open a discussion on GitHub
- Ask questions in the project's community channels

## License

By contributing to SynthGen, you agree that your contributions will be licensed under the project's [MIT License](LICENSE).

Thank you for contributing to SynthGen! 