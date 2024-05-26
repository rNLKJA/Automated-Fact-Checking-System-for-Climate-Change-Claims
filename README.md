# COMP90042-Natural-Language-Processing-Group-Project

2024 S1 COMP90042 Natural Language Processing Group Project

Overleaf Report: https://www.overleaf.com/read/sgchwdbmvjbq#c47aff 

## Team Members

| Name              | Student ID | Email                               |
| ----------------- | ---------- | ----------------------------------- |
| Xuan Wang         | 1329456    | xuan.wang8@student.unimelb.edu.au   |
| Wei Zhao          | 1118649    | weizhao1@student.unimelb.edu.au     |
| Sunchuangyu Huang | 1118472    | sunchuangyuh@student.unimelb.edu.au |

## Project Scope

The impact of climate change or humanity is a significant cocern. However, the increase is unverified statements regarding climate science has led to a distortion of public opinion, underscoring the importance of conducting on claims related to climate science. Consider the following claim and related evidence:

**Claim**: The Earth's climate sensitivity is so low that a doubling of atmoshperic CO2 will result in a surface temperature change on the order of 1 cellus degree or less.

**Evidence**:
1. In his first paper on the matter, he estimated that global temperature would rise by around 5 to 6 degrees (9.0 to 10.8 F) is the quantity of CO2 was doubled.
2. The 1990 IPPC First Assessment Report estimated that equilibrium climate sensitivity to a doubling of CO2 lay between 1.5 and 4.5 C (2.7 and 8.1F) with a "best guess in the light of current knowledge" of 2.5C (4.5C).

It should not be difficult to see that the claim is not supported by the evidence passages, and assuming the source of the evidence is reliable, such a claim is misleading. The challenge of the project is to develop an automated fact-checking system where given a claim, the goal is to find related evidence passages from a knowkedge source and classify whether the claim is supported by the evidence.

More concretely, you will be provided a list of claims and a corpus containing a large number evidence passages (the "knowledge source"), and your system must be:
1. search for the most related evidence passages from the knowledge source given the claim, and
2. classify the status of the claim givene the evidence in the fllowing classes: `{SUPPORTS, REFUTES, NOT_ENOUGH_INFO, DISPUTED}`.

To build a successful system, it must be able to retrieve the correct set of evidence passages and classify the claim correctly.

## Datasets

You are provided with several files for the project:
- `[train-claims, dev-claims].json`
- `[test-clcaims-unlabeled].json`
- `evidence.json`
- `dev-claims-baseline.json`
- `eval.py`

For the labelled claim files (`train-claims.json`, `dev-claims.json`), each increase ocntians the claim ID, claim text, claim label (one of the four classes: `{SUPPORTS, REFUTES, NOT_ENOUGH_INFO, DISPUTED}`, and a list of evidence IDs. The unlabelled claim file (`test-claims-unlabelled.json`) has a similar structure, except that it only contains the claim ID and claim text. 

### Training

The training set (`train-claims.json`) should be used for building the models, e.g. for use in development features, rules and heuristics, and for supervised/unsupervised learning. You are encouraged to inspect this data closely to fully understand the task.

### Validation

The development set (`dev-claims.json`) is formatted like the training set. This will help you make major implementation decisions (e.g. choosing optimal hyper-parameter configurations), and should also be used for detailed analysis of your system - both measuring performance and for error analysis - in the report.

### Testing

You will use the test set (`test-claims-unlabelled.json`) to participate in the Codalab competition. For this reason, no labels (i.e. the evidence passages and claim labels) are provided for this partition. You are allowed (and encouraged) to train your final system on both training and development set so as to maximise performance on the test set, but you should not at any time manually inspect the test datasets; any sign that you have done so will result in loss of marks. In terms of the format of the system output, it should has the identical  of `dev-claims-predictions.json`. Note, `claim_text` field is optional.

## Project Specification

**Allowed Resources**
- Deep learning libraries: Pytorch, Keas, and TensorFlow.
- Standard python libraries (e.g. numpy and matplotlib).
- NLP preprocessing toolkits (e.g. NLTK and Spacy).
- Source code provided from the workshop.

You **MUST** follow the rules below:
- use one of the following architectures: **RNN, LSTM, GRU and Transformer**.
- train your system from scratch, using the data provided in the project.
- submit `.ipynb` with log outputs.
- use the provided template [jupyter notebook](https://colab.research.google.com/drive/1CjlVXdEsioH_iGOHUbmrhimTLRXGJIt0?usp=sharing).
- train your system using only the provided data, which includes a training and a development.

You **MUST NOT**:
- **copy any open-source code** from any publications (in other words, you must implement the fact checking-system yourself).
- **use any pretrained word embeedings** (e.g Word2Vec), **pretrained language weights or checkpoints** (e.g. BERT checkpoints) or any **close-source models** (OpenAI GPT-3).
- **use any open source project code** from GitHub or other platforms.
- **submit the prediction results** (to the codalab leaderboard) that is **not produced from your code**.
- **use any rule-based techniques**
- **must not use models that cannot be run on colab**

## Project Dependencies

```bash
# run the following shell script
chmod +x ./env/create_conda_env.sh
./env/create_conda_env.sh
```

or create environment manually, dependencies are available in `env` folder.


## Testing and Evaluation

There are three evaluation metrics:

1. **Evidence Retrieval F-score (F)**
   - computes how well the evidence passages retrieved by the system match the ground truth evidence passages. For each claim, our evaluation considers all the retrieved evidence passages, computes the precision, recall and F-score by comparing them against the ground truth passages, and aggregates the F-scores by averaging over all claims.
   - E.g. given a claim if a system retrieves the following set `{evidence-1, evidence-2, evidence-3, evidence-4, evidence-5}`, and the ground truth set is `{evidence-1, evidence-5, evidence-10}`, then `precision = 2/5`, `recall = 2/3`, and `F-score = 1/2`. The aim of this metric is to measure how well the retrieval component of your fact checking system works.
2. **Claim Classification Accuracy (A)**
  - computes standard classification accuracy for claim label prediction, ignoring the set of evidence passages retrieved by the system. This metric assesses solely how well the system classifies the claim, and is designed to understand how well the classification component of your fact checking system works.
4. **Harmonic Mean of F and A**:
  - computes the harmonic mean of the evidence retrieval F-score and claim classification accuracy. Note that this metric is computed at the end after we have obtained the aggregate (over all claims) F-score and accuracy. This metric is designed to assess both the retrieval and classification components of your system, and as such will be used as **the main metric for ranking systems on Codalab**.

---

<p align=right>2024@Xuan Wei Sunchuangyu</p>
