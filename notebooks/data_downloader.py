import logging
import requests
from pathlib import Path
from abc import ABC, abstractmethod
import gdown
import os

class DataDownloader(ABC):
    @staticmethod
    @abstractmethod
    def download_train_claims(destination: Path = Path('data/train-claims.json')):
        """
        Download the JSON file for the labelled training set to the specified destination.
        
        This method is used to download the training data, which includes claims with labels (SUPPORTS, REFUTES, NOT_ENOUGH_INFO, DISPUTED) and evidence IDs. This data is essential for training the fact-checking model.
        
        Parameters:
        - destination (Path): The file path where the downloaded JSON should be saved. Defaults to 'data/train-claims.json'.
        
        Usage:
        DataDownloader.download_train_claims(Path('./data/train-claims.json'))
        """
        pass

    @staticmethod
    @abstractmethod
    def download_dev_claims(destination: Path = Path('data/dev-claims.json')):
        """
        Download the JSON file for the labelled development set to the specified destination.
        
        This method is used to download the development data, similar to the training set but typically used for hyperparameter tuning and model validation. It includes claims, labels, and evidence IDs.
        
        Parameters:
        - destination (Path): The file path where the downloaded JSON should be saved. Defaults to 'data/dev-claims.json'.
        
        Usage:
        DataDownloader.download_dev_claims(Path('./data/dev-claims.json'))
        """
        pass

    @staticmethod
    @abstractmethod
    def download_test_claims(destination: Path = Path('data/test-claims-unlabelled.json')):
        """
        Download the JSON file for the unlabelled test set to the specified destination.
        
        This method downloads the test data, which includes claims without labels. This dataset is used to evaluate the final performance of the fact-checking model in a competition setting.
        
        Parameters:
        - destination (Path): The file path where the downloaded JSON should be saved. Defaults to 'data/test-claims-unlabelled.json'.
        
        Usage:
        DataDownloader.download_test_claims(Path('./data/test-claims-unlabelled.json'))
        """
        pass

    @staticmethod
    @abstractmethod
    def download_dev_baseline(destination: Path = Path('data/dev-claims-baseline.json')):
        """
        Download the baseline predictions JSON file for the development set to the specified destination.
        
        This method downloads a set of baseline predictions for the development set. It can be used to benchmark the initial performance of your model against a simple baseline.
        
        Parameters:
        - destination (Path): The file path where the downloaded JSON should be saved. Defaults to 'data/dev-claims-baseline.json'.
        
        Usage:
        DataDownloader.download_dev_baseline(Path('./data/dev-claims-baseline.json'))
        """
        pass

    @staticmethod
    @abstractmethod
    def download_evidence(destination: Path = Path('data/evidence.json')):
        """
        Download the evidence file to the specified destination.
        
        This method downloads the evidence passages JSON file, which serves as the knowledge source for the fact-checking system. It contains a large number of evidence passages that the system will search through to find support or refutation for a given claim.
        
        Parameters:
        - destination (Path): The file path where the downloaded JSON should be saved. Defaults to 'data/evidence.json'.
        
        Usage:
        DataDownloader.download_evidence(Path('./data/evidence.json'))
        """
        pass
    
    @staticmethod
    @abstractmethod
    def download_all(destination_folder: Path = Path('data')):
        """
        Download all necessary files to the specified destination folder.
        
        This convenience method downloads all the necessary files for the project, including training, development, test sets, evidence passages, and baseline predictions. It's useful for setting up the project quickly.
        
        Parameters:
        - destination_folder (Path): The folder path where all the files should be saved. Defaults to 'data/'.
        
        Usage:
        DataDownloader.download_all(Path('./data'))
        """
        pass


logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

class ClimateFactCheckerDataDownloader(DataDownloader, ABC):
    # Class variable for the Google Drive URL for evidence.json
    evidence_gdrive_url = 'https://drive.google.com/uc?id=1JlUzRufknsHzKzvrEjgw8D3n_IRpjzo6'
    
    @staticmethod
    def download_file(url: str, destination: Path):
        """General method to download a file if it doesn't already exist."""
        if destination.exists():
            logging.info(f"File {destination} already exists. Skipping download.")
        else:
            logging.info(f"Downloading {url} to {destination}.")
            response = requests.get(url)
            destination.write_bytes(response.content)
            logging.info(f"Downloaded {destination}.")
    
    @staticmethod
    def download_train_claims(destination: Path = Path('data/train-claims.json')):
        url = 'https://raw.githubusercontent.com/drcarenhan/COMP90042_2024/main/data/train-claims.json'
        ClimateFactCheckerDataDownloader.download_file(url, destination)

    @staticmethod
    def download_dev_claims(destination: Path = Path('data/dev-claims.json')):
        url = 'https://raw.githubusercontent.com/drcarenhan/COMP90042_2024/main/data/dev-claims.json'
        ClimateFactCheckerDataDownloader.download_file(url, destination)

    @staticmethod
    def download_test_claims(destination: Path = Path('data/test-claims-unlabelled.json')):
        url = 'https://raw.githubusercontent.com/drcarenhan/COMP90042_2024/main/data/test-claims-unlabelled.json'
        ClimateFactCheckerDataDownloader.download_file(url, destination)

    @staticmethod
    def download_dev_baseline(destination: Path = Path('data/dev-claims-baseline.json')):
        url = 'https://raw.githubusercontent.com/drcarenhan/COMP90042_2024/main/data/dev-claims-baseline.json'
        ClimateFactCheckerDataDownloader.download_file(url, destination)

    @staticmethod
    def download_evidence(destination: Path = Path('data/evidence.json')):
        if destination.exists():
            logging.info(f"File {destination} already exists. Skipping download.")
        else:
            logging.info(f"Downloading evidence file from Google Drive to {destination}.")
            gdown.download(ClimateFactCheckerDataDownloader.evidence_gdrive_url, str(destination), quiet=False)
            logging.info(f"Downloaded evidence file to {destination}.")

    @staticmethod
    def download_all(destination_folder: Path = Path('data')):
        if not destination_folder.exists():
            destination_folder.mkdir(parents=True, exist_ok=True)
        
        ClimateFactCheckerDataDownloader.download_train_claims(destination_folder / 'train-claims.json')
        ClimateFactCheckerDataDownloader.download_dev_claims(destination_folder / 'dev-claims.json')
        ClimateFactCheckerDataDownloader.download_test_claims(destination_folder / 'test-claims-unlabelled.json')
        ClimateFactCheckerDataDownloader.download_dev_baseline(destination_folder / 'dev-claims-baseline.json')
        ClimateFactCheckerDataDownloader.download_evidence(destination_folder / 'evidence.json')
