"""
MapMyMeds Protocol - Setup Configuration
"""

from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="mapmymeds-protocol",
    version="0.1.0",
    author="MapMyMeds Team",
    description="Automated inter-pharmacy stock routing and financial settlement platform",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/benpaymaster/pharmafind",
    packages=find_packages(where="src"),
    package_dir={"": "src"},
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Healthcare Industry",
        "Topic :: Scientific/Engineering :: Medical Science Apps.",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
    ],
    python_requires=">=3.8",
    install_requires=[
        "httpx>=0.24.0",
        "fhir.resources>=7.0.0",
        "boto3>=1.28.0",
        "cryptography>=41.0.0",
        "pydantic>=2.0.0",
    ],
    extras_require={
        "dev": [
            "pytest>=7.4.0",
            "pytest-asyncio>=0.21.0",
            "mypy>=1.5.0",
            "black>=23.7.0",
            "flake8>=6.1.0",
        ],
    },
)
