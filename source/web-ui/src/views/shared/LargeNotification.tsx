// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import React from 'react';
import Jumbotron from 'react-bootstrap/Jumbotron';
import './LargeNotification.css';

type LargeNotificationProps = { displayText: string };
type LargeNotificationState = { displayText: string; };

export class LargeNotification extends React.Component<LargeNotificationProps, LargeNotificationState> {
    constructor(props: LargeNotificationProps) {
        super(props);
        this.state = { displayText: this.props.displayText };
    }

    componentDidUpdate(prevProps: LargeNotificationProps) {
        if (this.props.displayText !== prevProps.displayText) {
            this.setState({ displayText: this.props.displayText });
        }
    }

    render() {
        if (!this.state.displayText) { return; }

        return (
            <Jumbotron fluid>
                <h4 className="notification-text">{this.state.displayText}</h4>
            </Jumbotron>
        );
    }
}
