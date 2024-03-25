#!/bin/bash

ENV_NAME="nlp-python3.8"

echo "Creating Conda environment: $ENV_NAME"
conda env create -f environment.yml -n $ENV_NAME

echo "Activating environment: $ENV_NAME"
conda activate $ENV_NAME

if [ -f "requirements.txt" ]; then
    echo "Installing additional requirements from requirements.txt..."
    pip install -r requirements.txt

    if [ $? -ne 0 ]; then
        echo "Failed to install additional requirements."
        exit 1
    fi
else
    echo "requirements.txt file not found. Skipping additional requirements."
fi

echo "Installing IPython kernel..."
pip install ipykernel

echo "Creating IPython kernel for the environment..."
python -m ipykernel install --user --name $ENV_NAME --display-name "Jupyter - $ENV_NAME"

if [ $? -eq 0 ]; then
    echo "Successfully created IPython kernel: $ENV_NAME"
else
    echo "Failed to create IPython kernel."
    exit 1
fi

echo "Environment setup complete. Use the kernel named 'Jupyter - $ENV_NAME' in Jupyter."
