pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(artifactDaysToKeepStr: '14', numToKeepStr: '20'))
  }

  tools {
    nodejs 'NodeJS-22'
  }

  environment {
    CI = 'true'
    APP_BASE_PATH = '/ugt-sales-forecast'
    APP_BASE_URL = 'https://ugtweb.ube.co.th'
    IMAGE_NAME = 'ugt-sales-forecast'
    CONTAINER_NAME = 'ugt-sales-forecast'
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Install') {
      steps {
        sh 'npm ci'
        sh 'npm run db:generate'
      }
    }

    stage('Validate') {
      parallel {
        stage('TypeScript') {
          steps {
            sh 'npm run lint'
          }
        }
        stage('Production Build') {
          steps {
            sh 'npm run build:docker'
          }
        }
      }
    }

    stage('OWASP Dependency Check') {
      options {
        timeout(time: 90, unit: 'MINUTES')
      }
      steps {
        withCredentials([string(credentialsId: 'nvd', variable: 'NVD_API_KEY')]) {
          sh 'printf "nvd.api.key=%s\n" "$NVD_API_KEY" > dc-nvd.properties'
          dependencyCheck(
            odcInstallation: 'Dependency-Check',
            additionalArguments: '''
              --scan ./package.json
              --scan ./package-lock.json
              --format HTML
              --format XML
              --format JSON
              --out ./dc-report
              --suppression ./owasp-suppressions.xml
              --propertyfile dc-nvd.properties
              --noupdate
            '''
          )
        }
      }
      post {
        always {
          sh 'rm -f dc-nvd.properties'
          dependencyCheckPublisher(
            pattern: 'dc-report/dependency-check-report.xml',
            failedTotalCritical: 1,
            unstableTotalHigh: 1
          )
          archiveArtifacts artifacts: 'dc-report/dependency-check-report.*', allowEmptyArchive: true
        }
      }
    }

    stage('SonarQube Analysis') {
      steps {
        script {
          def branchName = env.BRANCH_NAME ?: env.GIT_BRANCH?.tokenize('/')?.last() ?: 'local'
          def safeBranch = branchName.replaceAll('[^A-Za-z0-9_.-]', '-')
          def projectKey = branchName == 'master' ? 'ugt-sales-forecast' : "ugt-sales-forecast-${safeBranch}"
          def projectName = branchName == 'master' ? 'UGT Sales Forecast' : "UGT Sales Forecast (${branchName})"
          def scannerHome = tool('SonarQube-Scanner')
          withSonarQubeEnv('SonarQube') {
            withEnv([
              "SONAR_SCANNER_HOME=${scannerHome}",
              "SONAR_PROJECT_KEY=${projectKey}",
              "SONAR_PROJECT_NAME=${projectName}",
            ]) {
              sh '''
                "$SONAR_SCANNER_HOME/bin/sonar-scanner" \
                  -Dsonar.projectKey="$SONAR_PROJECT_KEY" \
                  -Dsonar.projectName="$SONAR_PROJECT_NAME" \
                  -Dsonar.projectVersion="$BUILD_NUMBER"
              '''
            }
          }
        }
      }
    }

    stage('Quality Gate') {
      steps {
        timeout(time: 10, unit: 'MINUTES') {
          waitForQualityGate abortPipeline: true
        }
      }
    }

    stage('Docker Build') {
      when {
        expression {
          def branchName = env.BRANCH_NAME ?: env.GIT_BRANCH?.tokenize('/')?.last()
          branchName == 'master'
        }
      }
      steps {
        sh '''
          set -eu
          docker build \
            --build-arg APP_BASE_PATH="$APP_BASE_PATH" \
            --build-arg APP_BASE_URL="$APP_BASE_URL" \
            -t "$IMAGE_NAME:$BUILD_NUMBER" \
            -t "$IMAGE_NAME:latest" \
            .
          docker image inspect "$IMAGE_NAME:$BUILD_NUMBER" >/dev/null
        '''
      }
    }

    stage('Deploy') {
      when {
        expression {
          def branchName = env.BRANCH_NAME ?: env.GIT_BRANCH?.tokenize('/')?.last()
          branchName == 'master'
        }
      }
      steps {
        withCredentials([file(credentialsId: 'env-ugt-sales-forecast', variable: 'ENV_FILE')]) {
          sh '''
            set -eu
            install -m 600 "$ENV_FILE" .env
            node scripts/validate-deploy-env.mjs .env
            export IMAGE_NAME="$IMAGE_NAME"
            export IMAGE_TAG="$BUILD_NUMBER"
            export CONTAINER_NAME="$CONTAINER_NAME"

            docker compose config --quiet
            docker compose up -d --no-build --force-recreate

            echo "Waiting for $CONTAINER_NAME to become healthy..."
            for i in $(seq 1 24); do
              STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$CONTAINER_NAME" 2>/dev/null || echo 'not-found')
              echo "Attempt $i/24 - health status: $STATUS"
              if [ "$STATUS" = 'healthy' ]; then
                exit 0
              fi
              if [ "$STATUS" = 'unhealthy' ]; then
                docker logs --tail 200 "$CONTAINER_NAME" || true
                exit 1
              fi
              sleep 10
            done

            docker logs --tail 200 "$CONTAINER_NAME" || true
            echo 'Container did not become healthy within 4 minutes.'
            exit 1
          '''
        }
      }
    }
  }

  post {
    always {
      sh 'rm -f .env dc-nvd.properties'
      cleanWs()
    }
  }
}
