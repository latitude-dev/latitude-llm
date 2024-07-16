#!/bin/sh

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
