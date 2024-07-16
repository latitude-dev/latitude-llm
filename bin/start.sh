#!/bin/sh

# If node exists and is version is lower than 20.x, raise an error and exit
if command -v node &> /dev/null
then
    # Get the node version and remove the 'v' character
    node_version=$(node -v | sed 's/^v//')
    
    # Extract the major version number
    major_version=$(echo "$node_version" | cut -d. -f1)
    
    # Check if the major version number is less than 20
    if [ "$major_version" -lt 20 ]
    then
        echo "Node version is lower than 20.x. Please update your node version."
        exit 1
    fi
else
    echo "Node.js is not installed. Please install Node.js."
    exit 1
fi

# Install pnpm
if ! command -v pnpm &> /dev/null
then
  npm install -g pnpm 
fi

# Install tmux 
if ! command -v tmux &> /dev/null
then
    if command -v brew &> /dev/null
    then
        brew install tmux
    else
        sudo apt-get install tmux -y
    fi
fi

# Install tmuxinator
if ! command -v tmuxinator &> /dev/null
then
    if command -v brew &> /dev/null
    then
        brew install tmuxinator
    else
        sudo apt-get install tmuxinator -y
    fi
fi

# Have fun!
tmuxinator
