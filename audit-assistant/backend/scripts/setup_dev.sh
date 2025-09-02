#!/bin/bash
# Setup development environment for Audit Assistant

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Setting up development environment for Audit Assistant...${NC}"

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo -e "${GREEN}Creating virtual environment...${NC}"
    python3 -m venv venv
fi

# Activate virtual environment
echo -e "${GREEN}Activating virtual environment...${NC}"
source venv/bin/activate

# Upgrade pip and install dependencies
echo -e "${GREEN}Installing dependencies...${NC}"
pip install --upgrade pip
pip install -r requirements.txt

# Install development dependencies
pip install -r requirements-dev.txt

# Set up pre-commit hooks
echo -e "${GREEN}Setting up pre-commit hooks...${NC}"
pre-commit install

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo -e "${GREEN}Creating .env file...${NC}"
    cp .env.example .env
    
    # Generate a random secret key
    SECRET_KEY=$(python -c "import secrets; print(secrets.token_urlsafe(32))")
    
    # Update the .env file with the generated secret key
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/SECRET_KEY=.*/SECRET_KEY=$SECRET_KEY/" .env
    else
        # Linux/Unix
        sed -i "s/SECRET_KEY=.*/SECRET_KEY=$SECRET_KEY/" .env
    fi
    
    echo -e "${YELLOW}Please review the .env file and update the configuration as needed.${NC}"
fi

# Initialize the database
echo -e "${GREEN}Initializing the database...${NC}"
python init_db.py

echo -e "${GREEN}Setup complete!${NC}"
echo -e "${YELLOW}To start the development server, run:${NC}"
echo -e "  source venv/bin/activate"
echo -e "  python run.py"
