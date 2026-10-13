pipeline {
  agent {
    kubernetes {
      cloud 'kubernetes'
      defaultContainer 'tools'
      yaml '''
apiVersion: v1
kind: Pod
spec:
  serviceAccountName: frontend-deployer
  automountServiceAccountToken: true
  nodeSelector:
    kubernetes.io/hostname: vmi3584344
  securityContext:
    runAsUser: 1000
    runAsGroup: 1000
    fsGroup: 1000
  containers:
    - name: tools
      image: docker:29-cli
      command: ['cat']
      tty: true
    - name: buildkit
      image: moby/buildkit:rootless
      command: ['cat']
      tty: true
      env:
        - name: BUILDKITD_FLAGS
          value: --oci-worker-no-process-sandbox
      securityContext:
        seccompProfile:
          type: Unconfined
        appArmorProfile:
          type: Unconfined
      volumeMounts:
        - name: buildkit-data
          mountPath: /home/user/.local/share/buildkit
  volumes:
    - name: buildkit-data
      emptyDir: {}
'''
    }
  }

  options {
    skipDefaultCheckout()
    disableConcurrentBuilds()
  }

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
        container('buildkit') {
          withCredentials([usernamePassword(credentialsId: 'dockerhub-credentials', usernameVariable: 'DOCKERHUB_USERNAME', passwordVariable: 'DOCKERHUB_TOKEN')]) {
            sh '''
              set +x
              set -eu
              umask 077
              export DOCKER_CONFIG="$(mktemp -d)"
              trap 'rm -rf "$DOCKER_CONFIG"' EXIT
              AUTH="$(printf '%s:%s' "$DOCKERHUB_USERNAME" "$DOCKERHUB_TOKEN" | base64 | tr -d '\\n')"
              printf '{"auths":{"https://index.docker.io/v1/":{"auth":"%s"}}}' "$AUTH" > "$DOCKER_CONFIG/config.json"
              OUTPUT="$(printf 'type=image,"name=docker.io/%s:%s,docker.io/%s:latest",push=true' "$IMAGE" "$BUILD_NUMBER" "$IMAGE")"

              buildctl-daemonless.sh build \
                --frontend dockerfile.v0 \
                --local context=. \
                --local dockerfile=. \
                --output "$OUTPUT"
            '''
          }
        }
      }
    }

    stage('Deploy frontend') {
      steps {
        sh '''
          set -eu
          # shortcut: kubectl fixa a versão e arquitetura do cluster atual; atualizar ao migrar o cluster.
          wget -q https://dl.k8s.io/release/v1.37.1/bin/linux/amd64/kubectl -O /tmp/kubectl
          wget -q https://dl.k8s.io/release/v1.37.1/bin/linux/amd64/kubectl.sha256 -O /tmp/kubectl.sha256
          printf '%s  %s\\n' "$(cat /tmp/kubectl.sha256)" /tmp/kubectl | sha256sum -c -
          chmod +x /tmp/kubectl
          /tmp/kubectl -n fastshare set image deployment/frontend frontend="$IMAGE:$BUILD_NUMBER"
          /tmp/kubectl -n fastshare rollout status deployment/frontend --timeout=300s
        '''
      }
    }
  }
}
