pipeline {
  agent {
    docker {
      image 'docker:29-cli'
      args '-v /var/run/docker.sock:/var/run/docker.sock'
    }
  }

  options { skipDefaultCheckout() }

  environment {
    IMAGE = 'eduardogomesheleno/fastshare-front'
  }

  stages {
    stage('Build image') {
      steps {
        checkout scm
        sh 'docker build -t "$IMAGE:$BUILD_NUMBER" -t "$IMAGE:latest" .'
      }
    }

    stage('Publish image') {
      steps {
        withCredentials([usernamePassword(credentialsId: 'dockerhub-credentials', usernameVariable: 'DOCKERHUB_USERNAME', passwordVariable: 'DOCKERHUB_TOKEN')]) {
          sh '''
            echo "$DOCKERHUB_TOKEN" | docker login --username "$DOCKERHUB_USERNAME" --password-stdin
            docker push "$IMAGE:$BUILD_NUMBER"
            docker push "$IMAGE:latest"
            docker logout
          '''
        }
      }
    }
  }
}
