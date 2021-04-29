// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import './App.css';
import Amplify, { Auth, I18n } from 'aws-amplify';
import { withAuthenticator, AmplifySignOut } from '@aws-amplify/ui-react';
import React from 'react';
import { LargeNotification } from './views/shared/LargeNotification';
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Navbar from 'react-bootstrap/Navbar';
import { BrowserRouter as Router, Switch, Route } from 'react-router-dom';
import { Overview } from './views/overview/Overview';
import { MachineDetail } from './views/machines/MachineDetail';

declare var webUIAWSConfig: any;
Amplify.configure(webUIAWSConfig);

type AppProps = {};
type AppState = { email?: string };

class App extends React.Component<AppProps, AppState> {
  constructor(props: any) {
    super(props);
    this.state = {};
  }

  async componentDidMount() {
    try {
      const user = await Auth.currentAuthenticatedUser();
      if (user && user.attributes && user.attributes.email) {
        this.setState({ email: user.attributes.email });
      }
    } catch (err) {
      console.error(err);
      // Reload if the user is no longer authenticated
      window.location.reload();
    }

    // Check the accessToken to see if the user has logged out in another browser tab
    // If so, refresh the page so the user is logged out on all tabs
    try {
      window.addEventListener('storage', (evt) => {
        if (evt.storageArea === localStorage && evt.key) {
          if (evt.key.startsWith(`CognitoIdentityServiceProvider.${webUIAWSConfig.Auth.userPoolWebClientId}.`) && evt.key.endsWith('.accessToken')) {
            if (evt.oldValue && !evt.newValue) {
              window.location.reload();
            }
          }
        }
      })
    } catch (err) {
      console.error(err);
    }
  }

  render() {
    return (
      <div>
        <Navbar bg="light" expand="lg">
          <Navbar.Brand href="/">{`${I18n.get('app.title')}`}</Navbar.Brand>
          <Navbar.Toggle aria-controls="basic-navbar-nav" />
          <Navbar.Collapse className="justify-content-end">
            <Navbar.Text>{this.state.email}</Navbar.Text>
            <AmplifySignOut className="sign-out-button" buttonText={`${I18n.get('button.signOut')}`} />
          </Navbar.Collapse>
        </Navbar>
        <Container fluid key="app-container">
          <Row key="app-container-row">
            <Col key="app-container-col">
              <Router>
                <Switch>
                  <Route path="/" exact={true} render={(props) => (
                    <Overview {...props} selectedLocationStorageKeyName={`AwsSolution.MachineDowntimeMonitorOnAws.${webUIAWSConfig.Auth.userPoolWebClientId}.selectedLocation`} />
                  )} />
                  <Route path="/machine-detail/:machineId+" exact={true} component={MachineDetail} />
                  <Route path="*"><LargeNotification displayText={`${I18n.get('notification.unknownPath')}`}></LargeNotification></Route>
                </Switch>
              </Router>
            </Col>
          </Row>
        </Container>
      </div>
    );
  }
}

export default withAuthenticator(App);
