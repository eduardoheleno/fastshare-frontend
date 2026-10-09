pipeline {
  agent any

  options { skipDefaultCheckout() }

  environment {
    IMAGE = 'eduardogomesheleno/fastshare-front'
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Build and publish image') {
      steps {
        withCredentials([usernamePassword(credentialsId: 'dockerhub-credentials', usernameVariable: 'DOCKERHUB_USERNAME', passwordVariable: 'DOCKERHUB_TOKEN')]) {
          sh '''
            set +x
            set -eu
            export DOCKER_CONFIG="$(mktemp -d)"
            BUILDER=''
            cleanup() {
              if [ -n "$BUILDER" ]; then docker buildx rm "$BUILDER" || true; fi
              rm -rf "$DOCKER_CONFIG"
            }
            trap cleanup EXIT

            echo "$DOCKERHUB_TOKEN" | docker login --username "$DOCKERHUB_USERNAME" --password-stdin
            BUILDER="$(docker buildx create --driver docker-container)"
            docker buildx build --builder "$BUILDER" --push -t "$IMAGE:$BUILD_NUMBER" -t "$IMAGE:latest" .
          '''
        }
      }
    }
  }
}
